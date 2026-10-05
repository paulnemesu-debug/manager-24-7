#!/usr/bin/env python3
"""Repack a verified native APK with a new Hermes bundle and a fresh v2 test signature.

This is a fallback for direct device testing when the Android SDK/EAS builder is
unavailable. It keeps the already-built native code and resources, replaces only
the JS bundle plus Expo's public config, preserves ZIP alignment, and creates an
APK Signature Scheme v2 block. The generated key is for testing only.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import struct
import zlib
import zipfile
from dataclasses import dataclass
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.x509.oid import NameOID


EOCD_MAGIC = b"PK\x05\x06"
CENTRAL_MAGIC = b"PK\x01\x02"
LOCAL_MAGIC = b"PK\x03\x04"
APK_SIG_MAGIC = b"APK Sig Block 42"
APK_V2_ID = 0x7109871A
RSA_PKCS1_SHA256_ID = 0x0103
ALIGNMENT = 16 * 1024
CHUNK_SIZE = 1024 * 1024
RES_STRING_POOL_TYPE = 0x0001
RES_XML_START_ELEMENT_TYPE = 0x0102
UTF8_FLAG = 0x00000100


def u16(data: bytes | bytearray, offset: int) -> int:
    return struct.unpack_from("<H", data, offset)[0]


def u32(data: bytes | bytearray, offset: int) -> int:
    return struct.unpack_from("<I", data, offset)[0]


def u64(data: bytes | bytearray, offset: int) -> int:
    return struct.unpack_from("<Q", data, offset)[0]


def lp32(value: bytes) -> bytes:
    return struct.pack("<I", len(value)) + value


@dataclass
class CentralEntry:
    start: int
    name: str
    method: int
    crc: int
    compressed_size: int
    uncompressed_size: int
    local_offset: int


def find_eocd(apk: bytes) -> int:
    start = max(0, len(apk) - 65557)
    offset = apk.rfind(EOCD_MAGIC, start)
    if offset < 0 or offset + 22 + u16(apk, offset + 20) != len(apk):
        raise ValueError("EOCD ZIP invalid sau urmat de date neașteptate")
    return offset


def central_entries(directory: bytes | bytearray) -> list[CentralEntry]:
    result: list[CentralEntry] = []
    cursor = 0
    while cursor < len(directory):
        if directory[cursor : cursor + 4] != CENTRAL_MAGIC:
            raise ValueError(f"Intrare ZIP centrală invalidă la {cursor}")
        name_len = u16(directory, cursor + 28)
        extra_len = u16(directory, cursor + 30)
        comment_len = u16(directory, cursor + 32)
        end = cursor + 46 + name_len + extra_len + comment_len
        name = bytes(directory[cursor + 46 : cursor + 46 + name_len]).decode("utf-8")
        result.append(
            CentralEntry(
                start=cursor,
                name=name,
                method=u16(directory, cursor + 10),
                crc=u32(directory, cursor + 16),
                compressed_size=u32(directory, cursor + 20),
                uncompressed_size=u32(directory, cursor + 24),
                local_offset=u32(directory, cursor + 42),
            )
        )
        cursor = end
    return result


def _length8(data: bytes | bytearray, offset: int) -> tuple[int, int]:
    value = data[offset]
    if value & 0x80:
        return ((value & 0x7F) << 8) | data[offset + 1], offset + 2
    return value, offset + 1


def _length16(data: bytes | bytearray, offset: int) -> tuple[int, int]:
    value = u16(data, offset)
    if value & 0x8000:
        return ((value & 0x7FFF) << 16) | u16(data, offset + 2), offset + 4
    return value, offset + 2


def axml_strings(data: bytes | bytearray) -> tuple[list[str], int]:
    chunk = 8
    if u16(data, chunk) != RES_STRING_POOL_TYPE:
        raise ValueError("AndroidManifest.xml nu începe cu String Pool")
    header_size = u16(data, chunk + 2)
    chunk_size = u32(data, chunk + 4)
    string_count = u32(data, chunk + 8)
    flags = u32(data, chunk + 16)
    strings_start = u32(data, chunk + 20)
    offsets_start = chunk + header_size
    strings_base = chunk + strings_start
    result: list[str] = []
    for index in range(string_count):
        cursor = strings_base + u32(data, offsets_start + index * 4)
        if flags & UTF8_FLAG:
            _, cursor = _length8(data, cursor)
            byte_length, cursor = _length8(data, cursor)
            result.append(bytes(data[cursor : cursor + byte_length]).decode("utf-8"))
        else:
            length, cursor = _length16(data, cursor)
            result.append(bytes(data[cursor : cursor + length * 2]).decode("utf-16le"))
    return result, chunk + chunk_size


def patch_android_manifest(manifest: bytes) -> bytes:
    data = bytearray(manifest)
    strings, cursor = axml_strings(data)
    try:
        version_code_index = strings.index("versionCode")
    except ValueError as error:
        raise ValueError("Atributul versionCode lipsește din AndroidManifest.xml") from error

    version_name_old = "1.2.3".encode("utf-16le")
    version_name_new = "1.3.0".encode("utf-16le")
    if data.count(version_name_old) != 1:
        raise ValueError("Șirul versionName 1.2.3 nu este unic în manifest")
    data[:] = data.replace(version_name_old, version_name_new)

    updated_code = False
    while cursor < len(data):
        chunk_type = u16(data, cursor)
        header_size = u16(data, cursor + 2)
        chunk_size = u32(data, cursor + 4)
        if chunk_size < header_size or cursor + chunk_size > len(data):
            raise ValueError("Chunk AXML invalid")
        if chunk_type == RES_XML_START_ELEMENT_TYPE:
            attribute_start = u16(data, cursor + 16 + 8)
            attribute_size = u16(data, cursor + 16 + 10)
            attribute_count = u16(data, cursor + 16 + 12)
            first_attribute = cursor + 16 + attribute_start
            for index in range(attribute_count):
                attribute = first_attribute + index * attribute_size
                if u32(data, attribute + 4) == version_code_index:
                    struct.pack_into("<I", data, attribute + 16, 43)
                    updated_code = True
        cursor += chunk_size
    if not updated_code:
        raise ValueError("Valoarea versionCode nu a fost găsită în AXML")
    return bytes(data)


def strip_signing_block(apk: bytes) -> tuple[bytes, bytes, bytes]:
    eocd_offset = find_eocd(apk)
    eocd = apk[eocd_offset:]
    cd_offset = u32(eocd, 16)
    cd_size = u32(eocd, 12)
    if cd_offset + cd_size != eocd_offset:
        raise ValueError("Central Directory nu este lipit de EOCD")
    if apk[cd_offset - 16 : cd_offset] != APK_SIG_MAGIC:
        raise ValueError("APK-ul de bază nu are bloc de semnătură v2/v3")
    size = u64(apk, cd_offset - 24)
    block_start = cd_offset - (size + 8)
    if block_start < 0 or u64(apk, block_start) != size:
        raise ValueError("Blocul de semnătură APK este inconsistent")
    return apk[:block_start], apk[cd_offset:eocd_offset], eocd


def extract_entry(local_data: bytes, entry: CentralEntry) -> bytes:
    offset = entry.local_offset
    if local_data[offset : offset + 4] != LOCAL_MAGIC:
        raise ValueError(f"Antet local invalid pentru {entry.name}")
    flags = u16(local_data, offset + 6)
    method = u16(local_data, offset + 8)
    if flags & 0x08 or method not in (0, 8):
        raise ValueError(f"Metodă ZIP neacceptată pentru {entry.name}")
    name_len = u16(local_data, offset + 26)
    extra_len = u16(local_data, offset + 28)
    data_start = offset + 30 + name_len + extra_len
    compressed = local_data[data_start : data_start + entry.compressed_size]
    return compressed if method == 0 else zlib.decompress(compressed, -15)


def replace_stored_entries(
    original_local: bytes,
    directory: bytes,
    replacements: dict[str, bytes],
) -> tuple[bytes, bytes]:
    entries = central_entries(directory)
    by_name = {entry.name: entry for entry in entries}
    missing = sorted(set(replacements) - set(by_name))
    if missing:
        raise ValueError(f"Lipsesc intrările APK: {', '.join(missing)}")

    local = bytearray(original_local)
    deltas: list[tuple[int, int]] = []
    metadata: dict[str, tuple[int, int, int]] = {}

    for name in sorted(replacements, key=lambda item: by_name[item].local_offset):
        entry = by_name[name]
        shift = sum(delta for offset, delta in deltas if offset < entry.local_offset)
        offset = entry.local_offset + shift
        if local[offset : offset + 4] != LOCAL_MAGIC:
            raise ValueError(f"Antet local invalid după realiniere pentru {name}")
        flags = u16(local, offset + 6)
        method = u16(local, offset + 8)
        if flags & 0x08 or method not in (0, 8):
            raise ValueError(f"Metodă ZIP neacceptată pentru {name}")
        name_len = u16(local, offset + 26)
        extra_len = u16(local, offset + 28)
        data_start = offset + 30 + name_len + extra_len
        old_end = data_start + entry.compressed_size
        content = replacements[name]
        crc = zlib.crc32(content) & 0xFFFFFFFF
        if method == 0:
            encoded = content
        else:
            compressor = zlib.compressobj(level=9, wbits=-15)
            encoded = compressor.compress(content) + compressor.flush()

        header = bytearray(local[offset:data_start])
        struct.pack_into("<III", header, 14, crc, len(encoded), len(content))
        raw_delta = len(encoded) - entry.compressed_size
        trailing_padding = (-raw_delta) % ALIGNMENT
        replacement = bytes(header) + encoded + (b"\0" * trailing_padding)
        old_region_size = old_end - offset
        delta = len(replacement) - old_region_size
        if delta % ALIGNMENT:
            raise AssertionError("Realinierea trebuie să păstreze multiplii de 16 KiB")
        local[offset:old_end] = replacement
        deltas.append((entry.local_offset, delta))
        metadata[name] = (crc, len(encoded), len(content))

    updated_directory = bytearray(directory)
    for entry in entries:
        new_offset = entry.local_offset + sum(
            delta for replaced_offset, delta in deltas if replaced_offset < entry.local_offset
        )
        struct.pack_into("<I", updated_directory, entry.start + 42, new_offset)
        if entry.name in metadata:
            crc, compressed_size, uncompressed_size = metadata[entry.name]
            struct.pack_into(
                "<III",
                updated_directory,
                entry.start + 16,
                crc,
                compressed_size,
                uncompressed_size,
            )

    return bytes(local), bytes(updated_directory)


def content_digest(sections: list[bytes]) -> bytes:
    chunk_hashes: list[bytes] = []
    for section in sections:
        for start in range(0, len(section), CHUNK_SIZE):
            chunk = section[start : start + CHUNK_SIZE]
            chunk_hashes.append(
                hashlib.sha256(b"\xA5" + struct.pack("<I", len(chunk)) + chunk).digest()
            )
    return hashlib.sha256(
        b"\x5A" + struct.pack("<I", len(chunk_hashes)) + b"".join(chunk_hashes)
    ).digest()


def generate_test_identity(key_path: Path, cert_path: Path):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name(
        [
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "PARADIM Operations SRL"),
            x509.NameAttribute(NameOID.COMMON_NAME, "Manager 24/7 local test"),
        ]
    )
    now = dt.datetime.now(dt.timezone.utc)
    certificate = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - dt.timedelta(days=1))
        .not_valid_after(now + dt.timedelta(days=3650))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )
    key_path.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    os.chmod(key_path, 0o600)
    cert_path.write_bytes(certificate.public_bytes(serialization.Encoding.PEM))
    return key, certificate


def apk_v2_block(digest: bytes, key, certificate: x509.Certificate) -> tuple[bytes, bytes]:
    cert_der = certificate.public_bytes(serialization.Encoding.DER)
    public_der = key.public_key().public_bytes(
        serialization.Encoding.DER,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    digest_record = struct.pack("<I", RSA_PKCS1_SHA256_ID) + lp32(digest)
    digests = lp32(digest_record)
    certificates = lp32(cert_der)
    signed_data = lp32(digests) + lp32(certificates) + lp32(b"")
    signature = key.sign(signed_data, padding.PKCS1v15(), hashes.SHA256())
    signature_record = struct.pack("<I", RSA_PKCS1_SHA256_ID) + lp32(signature)
    signatures = lp32(signature_record)
    signer = lp32(signed_data) + lp32(signatures) + lp32(public_der)
    # The v2 value starts with a length-prefixed signer sequence; each signer
    # inside that sequence is length-prefixed again.
    v2_value = lp32(lp32(signer))
    pair_payload = struct.pack("<I", APK_V2_ID) + v2_value
    pair = struct.pack("<Q", len(pair_payload)) + pair_payload
    size = len(pair) + 24
    block = struct.pack("<Q", size) + pair + struct.pack("<Q", size) + APK_SIG_MAGIC
    return block, signed_data


def sign_apk(local: bytes, directory: bytes, eocd: bytes, key, certificate) -> bytes:
    digest_eocd = bytearray(eocd)
    struct.pack_into("<I", digest_eocd, 16, len(local))
    digest = content_digest([local, directory, bytes(digest_eocd)])
    block, _ = apk_v2_block(digest, key, certificate)
    final_eocd = bytearray(eocd)
    struct.pack_into("<I", final_eocd, 16, len(local) + len(block))
    return local + block + directory + bytes(final_eocd)


def verify_own_v2_signature(apk: bytes) -> None:
    eocd_offset = find_eocd(apk)
    eocd = apk[eocd_offset:]
    cd_offset = u32(eocd, 16)
    directory = apk[cd_offset:eocd_offset]
    size = u64(apk, cd_offset - 24)
    block_start = cd_offset - size - 8
    block = apk[block_start:cd_offset]
    if block[-16:] != APK_SIG_MAGIC or u64(block, 0) != u64(block, len(block) - 24):
        raise ValueError("Semnătura v2 generată are antet invalid")
    pair_len = u64(block, 8)
    if u32(block, 16) != APK_V2_ID:
        raise ValueError("Lipsește perechea de semnătură APK v2")
    value = block[20 : 8 + 8 + pair_len]

    def take_lp(data: bytes, cursor: int) -> tuple[bytes, int]:
        length = u32(data, cursor)
        start = cursor + 4
        return data[start : start + length], start + length

    signers, cursor = take_lp(value, 0)
    if cursor != len(value):
        raise ValueError("Container de signeri v2 invalid")
    signer, cursor = take_lp(signers, 0)
    if cursor != len(signers):
        raise ValueError("Secvență de signeri v2 invalidă")
    signed_data, cursor = take_lp(signer, 0)
    signatures, cursor = take_lp(signer, cursor)
    public_der, cursor = take_lp(signer, cursor)
    if cursor != len(signer):
        raise ValueError("Signer v2 cu date suplimentare")

    signature_record, cursor = take_lp(signatures, 0)
    if cursor != len(signatures) or u32(signature_record, 0) != RSA_PKCS1_SHA256_ID:
        raise ValueError("Algoritm de semnătură v2 neașteptat")
    signature, cursor = take_lp(signature_record, 4)
    if cursor != len(signature_record):
        raise ValueError("Înregistrare de semnătură invalidă")
    public_key = serialization.load_der_public_key(public_der)
    public_key.verify(signature, signed_data, padding.PKCS1v15(), hashes.SHA256())

    digests, cursor = take_lp(signed_data, 0)
    digest_record, digest_cursor = take_lp(digests, 0)
    if digest_cursor != len(digests) or u32(digest_record, 0) != RSA_PKCS1_SHA256_ID:
        raise ValueError("Digest v2 neașteptat")
    stored_digest, digest_cursor = take_lp(digest_record, 4)
    if digest_cursor != len(digest_record):
        raise ValueError("Înregistrare digest invalidă")
    digest_eocd = bytearray(eocd)
    struct.pack_into("<I", digest_eocd, 16, block_start)
    expected = content_digest([apk[:block_start], directory, bytes(digest_eocd)])
    if stored_digest != expected:
        raise ValueError("Digestul APK v2 nu corespunde conținutului")


def assert_alignment(apk: bytes) -> None:
    eocd_offset = find_eocd(apk)
    cd_offset = u32(apk, eocd_offset + 16)
    entries = central_entries(apk[cd_offset:eocd_offset])
    for entry in entries:
        offset = entry.local_offset
        name_len = u16(apk, offset + 26)
        extra_len = u16(apk, offset + 28)
        data_offset = offset + 30 + name_len + extra_len
        if entry.method == 0 and data_offset % 4:
            raise ValueError(f"Intrare nealiniată la 4 bytes: {entry.name}")
        if entry.name.endswith(".so") and data_offset % 4096:
            raise ValueError(f"Bibliotecă nativă nealiniată la 4096 bytes: {entry.name}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-apk", required=True, type=Path)
    parser.add_argument("--bundle", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--key-out", required=True, type=Path)
    parser.add_argument("--cert-out", required=True, type=Path)
    args = parser.parse_args()

    base = args.base_apk.read_bytes()
    local, directory, eocd = strip_signing_block(base)
    entries = {entry.name: entry for entry in central_entries(directory)}
    config = json.loads(extract_entry(local, entries["assets/app.config"]).decode("utf-8"))
    manifest = patch_android_manifest(extract_entry(local, entries["AndroidManifest.xml"]))
    config["version"] = "1.3.0"
    config.setdefault("android", {})["versionCode"] = 43
    config.setdefault("ios", {})["buildNumber"] = "13"
    config_bytes = json.dumps(config, ensure_ascii=False, separators=(",", ":")).encode("utf-8")

    local, directory = replace_stored_entries(
        local,
        directory,
        {
            "AndroidManifest.xml": manifest,
            "assets/app.config": config_bytes,
            "assets/index.android.bundle": args.bundle.read_bytes(),
        },
    )
    key, certificate = generate_test_identity(args.key_out, args.cert_out)
    output = sign_apk(local, directory, eocd, key, certificate)
    args.output.write_bytes(output)

    verify_own_v2_signature(output)
    assert_alignment(output)
    with zipfile.ZipFile(args.output) as archive:
        broken = archive.testzip()
        if broken:
            raise ValueError(f"CRC ZIP invalid pentru {broken}")
        if archive.read("assets/index.android.bundle") != args.bundle.read_bytes():
            raise ValueError("Bundle-ul Hermes din APK nu este cel generat")
        final_config = json.loads(archive.read("assets/app.config"))
        if final_config.get("version") != "1.3.0":
            raise ValueError("Configurația Expo nu a fost actualizată")

    print(json.dumps({
        "apk": str(args.output),
        "bytes": len(output),
        "sha256": hashlib.sha256(output).hexdigest(),
        "signature": "APK Signature Scheme v2 / RSA-2048 test key",
        "version": "1.3.0",
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()

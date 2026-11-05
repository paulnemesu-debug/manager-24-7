package ro.paradim.qa.pdfsink;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;

/** Local test recipient. Accepts only explicitly shared PDFs named for the synthetic QA recipe. */
public final class PdfReceiverActivity extends Activity {
    private static final String AUTHORITY = "ro.paradim.professionalfoodcost.SharingFileProvider";
    private static final String DIRECTORY = Environment.DIRECTORY_DOWNLOADS + "/Manager247-QA/";
    private LinearLayout content;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        ScrollView scroll = new ScrollView(this);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(20, 20, 20, 20);
        scroll.addView(content);
        setContentView(scroll);
        try {
            if (Intent.ACTION_SEND.equals(getIntent().getAction())) receivePdf();
            else label("QA PDF sink ready");
            if (getPreferences(MODE_PRIVATE).contains("savedUri")) {
                label("Saved file: " + getPreferences(MODE_PRIVATE).getString("name", ""));
                Button reopen = new Button(this);
                reopen.setText("Reopen saved PDF");
                reopen.setOnClickListener(new View.OnClickListener() {
                    @Override public void onClick(View view) {
                        try { reopenSaved(); } catch (Exception error) { failure(error); }
                    }
                });
                content.addView(reopen);
            }
        } catch (Exception error) { failure(error); }
    }

    private void receivePdf() throws Exception {
        if (!"application/pdf".equals(getIntent().getType())) throw new IllegalArgumentException();
        Uri input = getIntent().getParcelableExtra(Intent.EXTRA_STREAM);
        if (input == null || !"content".equals(input.getScheme()) || !AUTHORITY.equals(input.getAuthority())) {
            throw new SecurityException();
        }
        String name;
        try (Cursor cursor = getContentResolver().query(input, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor == null || !cursor.moveToFirst()) throw new IllegalArgumentException();
            name = cursor.getString(0);
        }
        if (name == null || !name.matches("(?i)QA[-_ ]Recipe[-_ ]\\d+-\\d+-food-cost\\.pdf")) {
            throw new SecurityException();
        }
        Uri collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        try (Cursor existing = getContentResolver().query(collection, new String[] {"_id"},
                "_display_name=? AND relative_path=?", new String[] {name, DIRECTORY}, null)) {
            if (existing != null && existing.moveToFirst()) throw new IllegalStateException();
        }
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, name);
        values.put(MediaStore.Downloads.MIME_TYPE, "application/pdf");
        values.put(MediaStore.Downloads.RELATIVE_PATH, DIRECTORY);
        values.put(MediaStore.Downloads.IS_PENDING, 1);
        Uri saved = getContentResolver().insert(collection, values);
        if (saved == null) throw new IllegalStateException();
        boolean complete = false;
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long bytes = 0;
            try (InputStream source = getContentResolver().openInputStream(input);
                 OutputStream target = getContentResolver().openOutputStream(saved, "w")) {
                if (source == null || target == null) throw new IllegalStateException();
                byte[] prefix = new byte[5];
                int offset = 0;
                while (offset < prefix.length) {
                    int count = source.read(prefix, offset, prefix.length - offset);
                    if (count <= 0) throw new IllegalArgumentException();
                    offset += count;
                }
                if (!"%PDF-".equals(new String(prefix, "US-ASCII"))) throw new IllegalArgumentException();
                target.write(prefix); digest.update(prefix); bytes += prefix.length;
                byte[] buffer = new byte[16384];
                int count;
                while ((count = source.read(buffer)) != -1) {
                    bytes += count;
                    if (bytes > 10 * 1024 * 1024) throw new IllegalArgumentException();
                    target.write(buffer, 0, count); digest.update(buffer, 0, count);
                }
            }
            values.clear(); values.put(MediaStore.Downloads.IS_PENDING, 0);
            if (getContentResolver().update(saved, values, null, null) != 1) throw new IllegalStateException();
            StringBuilder hex = new StringBuilder();
            for (byte value : digest.digest()) hex.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
            if (!getPreferences(MODE_PRIVATE).edit().putString("savedUri", saved.toString())
                    .putString("name", name).putString("sha256", hex.toString()).putLong("bytes", bytes).commit()) {
                throw new IllegalStateException();
            }
            complete = true;
            label("QA PDF saved"); label("Bytes: " + bytes); label("SHA256: " + hex);
        } finally {
            if (!complete) getContentResolver().delete(saved, null, null);
        }
    }

    private void reopenSaved() throws Exception {
        Uri saved = Uri.parse(getPreferences(MODE_PRIVATE).getString("savedUri", ""));
        ParcelFileDescriptor descriptor = getContentResolver().openFileDescriptor(saved, "r");
        if (descriptor == null) throw new IllegalStateException();
        Bitmap image;
        try (PdfRenderer renderer = new PdfRenderer(descriptor)) {
            if (renderer.getPageCount() < 1) throw new IllegalArgumentException();
            label("Pages: " + renderer.getPageCount());
            try (PdfRenderer.Page page = renderer.openPage(0)) {
                int height = Math.min(2048, Math.max(1, page.getHeight() * 720 / page.getWidth()));
                image = Bitmap.createBitmap(720, height, Bitmap.Config.ARGB_8888);
                image.eraseColor(Color.WHITE);
                page.render(image, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
            }
        } finally { descriptor.close(); }
        label("QA PDF saved and reopened");
        ImageView preview = new ImageView(this);
        preview.setContentDescription("QA PDF rendered page 1");
        preview.setAdjustViewBounds(true); preview.setImageBitmap(image);
        content.addView(preview);
    }

    private void label(String text) {
        TextView view = new TextView(this); view.setText(text); view.setTextSize(18); content.addView(view);
    }
    private void failure(Exception error) { label("QA PDF failed: " + error.getClass().getSimpleName()); }
}

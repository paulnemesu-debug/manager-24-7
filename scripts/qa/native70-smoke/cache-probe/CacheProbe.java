package ro.paradim.qa;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.json.JSONArray;
import org.json.JSONObject;

/** Disposable-emulator diagnostic. No cache writes, account queries or raw-value output. */
public final class CacheProbe {
    private static final String OWNER = "1ccbbbba-a0e7-48c2-ba49-a6a7bb9816f1";
    private static final String DATABASE = "/data/user/0/ro.paradim.professionalfoodcost/databases/RKStorage";
    private static final String[] PREFIXES = {
        "manager247.asset-profiles.v1.", "manager247.haccp-equipment.v1.", "manager247.maintenance-entries.v1."
    };
    private static final String[] STORES = {"asset-profiles", "haccp-equipment", "maintenance-entries"};

    private static String sha(String value) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder result = new StringBuilder();
        for (byte item : digest) result.append(String.format("%02x", item & 255));
        return result.toString();
    }

    private static JSONObject read(SQLiteDatabase db, int index, String expectedName) throws Exception {
        JSONObject result = new JSONObject().put("store", STORES[index]).put("present", false);
        // Fixed exact keys only. Never enumerate keys or select authentication/session records.
        try (Cursor cursor = db.query("catalystLocalStorage", new String[]{"value"}, "key = ?",
                new String[]{PREFIXES[index] + OWNER}, null, null, null, "2")) {
            if (!cursor.moveToFirst()) return result;
            if (cursor.getCount() != 1) return result.put("error", "duplicate-key");
            String raw = cursor.getString(0);
            result.put("present", true).put("valueSha256", sha(raw));
            if (raw.length() > 4 * 1024 * 1024) return result.put("error", "value-too-large");
            JSONArray rows;
            try { rows = new JSONArray(raw); }
            catch (Exception invalid) { return result.put("error", "invalid-json-array"); }
            int matching = 0;
            boolean allObjects = true, stringIdName = true;
            for (int position = 0; position < rows.length(); position++) {
                Object row = rows.get(position);
                if (!(row instanceof JSONObject)) { allObjects = false; stringIdName = false; continue; }
                JSONObject item = (JSONObject) row;
                if (!(item.opt("id") instanceof String)) stringIdName = false;
                if (index != 2 && !(item.opt("name") instanceof String)) stringIdName = false;
                if (index != 2 && expectedName.equals(item.optString("name"))) {
                    matching++;
                    if (item.opt("id") instanceof String) result.put("expectedIdSha256", sha(item.getString("id")));
                    result.put("expectedRecordSha256", sha(item.toString()));
                    if (index == 0) result.put("expectedBrandMatches", "QABrand".equals(item.optString("brand")))
                        .put("expectedAvailable", item.opt("available") instanceof Boolean && item.optBoolean("available"));
                }
            }
            return result.put("count", rows.length()).put("allEntriesObjects", allObjects)
                .put("allHaveStringIdAndName", stringIdName).put("expectedNameCount", matching);
        }
    }

    public static void main(String[] args) throws Exception {
        if (android.os.Process.myUid() != 0 || args.length != 1 || !args[0].matches("QA Oven [0-9]+-[0-9]+")) {
            throw new IllegalArgumentException("Disposable root emulator and synthetic marker required");
        }
        JSONObject output = new JSONObject().put("readOnly", true).put("owner", "nativeC")
            .put("databasePresent", new File(DATABASE).isFile());
        JSONArray stores = new JSONArray();
        if (new File(DATABASE).isFile()) {
            // OPEN_READONLY does not create/upgrade the application database. SELECT only.
            try (SQLiteDatabase db = SQLiteDatabase.openDatabase(DATABASE, null,
                    SQLiteDatabase.OPEN_READONLY | SQLiteDatabase.NO_LOCALIZED_COLLATORS)) {
                for (int index = 0; index < PREFIXES.length; index++) {
                    try { stores.put(read(db, index, args[0])); }
                    catch (Exception failed) {
                        stores.put(new JSONObject().put("store", STORES[index]).put("error", "read-failed"));
                    }
                }
            }
        }
        System.out.println(output.put("stores", stores).toString());
    }
}

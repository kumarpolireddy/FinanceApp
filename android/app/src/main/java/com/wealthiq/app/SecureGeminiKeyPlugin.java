package com.wealthiq.app;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

@CapacitorPlugin(name = "SecureGeminiKey")
public class SecureGeminiKeyPlugin extends Plugin {
    private static final String ALIAS = "wealthiq.gemini.v1";

    private AtomicFile file() {
        // Excluded from Android backup and device transfer.
        return new AtomicFile(new File(getContext().getNoBackupFilesDir(), "gemini-key.enc"));
    }

    private KeyStore keyStore() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        return store;
    }

    private SecretKey encryptionKey() throws Exception {
        KeyStore store = keyStore();
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).build());
        return generator.generateKey();
    }

    @PluginMethod
    public synchronized void hasKey(PluginCall call) {
        JSObject result = new JSObject();
        result.put("saved", file().getBaseFile().exists());
        call.resolve(result);
    }

    @PluginMethod
    public synchronized void saveKey(PluginCall call) {
        String key = call.getString("key", "").trim();
        if (key.isEmpty()) { call.reject("Please enter a Gemini API key."); return; }
        byte[] plaintext = key.getBytes(StandardCharsets.UTF_8);
        FileOutputStream output = null;
        AtomicFile target = file();
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, encryptionKey());
            JSONObject record = new JSONObject();
            record.put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP));
            record.put("ciphertext", Base64.encodeToString(cipher.doFinal(plaintext), Base64.NO_WRAP));
            output = target.startWrite();
            output.write(record.toString().getBytes(StandardCharsets.UTF_8));
            target.finishWrite(output);
            call.resolve();
        } catch (Exception ignored) {
            if (output != null) target.failWrite(output);
            call.reject("Unable to securely save your key on this device.");
        } finally {
            Arrays.fill(plaintext, (byte) 0);
            call.getData().remove("key");
        }
    }

    @PluginMethod
    public synchronized void getKey(PluginCall call) {
        JSObject result = new JSObject();
        if (!file().getBaseFile().exists()) {
            result.put("key", JSONObject.NULL);
            call.resolve(result);
            return;
        }
        byte[] plaintext = null;
        try {
            JSONObject record = new JSONObject(new String(file().readFully(), StandardCharsets.UTF_8));
            SecretKey key = (SecretKey) keyStore().getKey(ALIAS, null);
            if (key == null) throw new IllegalStateException();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, Base64.decode(record.getString("iv"), Base64.NO_WRAP)));
            plaintext = cipher.doFinal(Base64.decode(record.getString("ciphertext"), Base64.NO_WRAP));
            result.put("key", new String(plaintext, StandardCharsets.UTF_8));
            call.resolve(result);
        } catch (Exception ignored) {
            call.reject("Your saved key could not be unlocked. Remove it and save it again in Settings.");
        } finally {
            if (plaintext != null) Arrays.fill(plaintext, (byte) 0);
        }
    }

    @PluginMethod
    public synchronized void removeKey(PluginCall call) {
        try {
            keyStore().deleteEntry(ALIAS);
            file().delete();
            if (file().getBaseFile().exists()) throw new IllegalStateException();
            call.resolve();
        } catch (Exception ignored) {
            call.reject("Unable to remove your saved key. Please try again.");
        }
    }
}

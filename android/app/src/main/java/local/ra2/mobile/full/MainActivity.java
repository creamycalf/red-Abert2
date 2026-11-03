package local.ra2.mobile.full;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentValues;
import android.content.Intent;
import android.content.res.AssetFileDescriptor;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.View;
import android.view.WindowManager;
import android.webkit.*;
import java.io.*;
import java.util.*;
import java.util.regex.*;

/** Private offline host; the original game runs in the packaged VM Worker. */
public class MainActivity extends Activity {
    private WebView web;
    private ValueCallback<Uri[]> picker;
    private static final String HOST = "ra2full.local";
    private void fullscreen() {
        getWindow().getDecorView().setSystemUiVisibility(5894 | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }
    @Override public void onWindowFocusChanged(boolean focus) { super.onWindowFocusChanged(focus); if(focus) fullscreen(); }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        fullscreen();
        web = new WebView(this);
        web.setBackgroundColor(0xff171a1b);
        setContentView(web);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportZoom(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.addJavascriptInterface(new SaveBridge(), "RA2Android");
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (picker != null) picker.onReceiveValue(null);
                picker = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.setType("*/*"); intent.addCategory(Intent.CATEGORY_OPENABLE);
                startActivityForResult(intent, 42); return true;
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return !HOST.equals(r.getUrl().getHost()); }
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) { return serve(r); }
            @Override public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) {
                v.destroy(); web = null;
                new AlertDialog.Builder(MainActivity.this).setTitle("游戏运行环境已停止")
                    .setMessage("已保存的进度仍在本机。请重新启动并读取存档。")
                    .setPositiveButton("重新启动", (d, which) -> recreate()).setNegativeButton("关闭", (d, which) -> finish()).show();
                return true;
            }
        });
        web.loadUrl("https://" + HOST + "/?mobile=1&bundled=1&mouse-lock=0&network=0");
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if(request == 42 && picker != null) { picker.onReceiveValue(result == RESULT_OK && data != null ? new Uri[]{data.getData()} : null); picker = null; }
    }
    private WebResourceResponse empty(int code, String reason) {
        return new WebResourceResponse("text/plain", "UTF-8", code, reason, Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }
    private WebResourceResponse serve(WebResourceRequest request) {
        if(!HOST.equals(request.getUrl().getHost())) return empty(403, "Offline host only");
        String path = request.getUrl().getPath();
        if(path == null || path.equals("/")) path = "/index.html";
        if(path.contains("..") || path.contains("\\") || path.indexOf('\0') >= 0) return empty(400, "Invalid path");
        String assetPath = path.substring(1) + (path.endsWith(".gz") ? ".bin" : "");
        String mime = path.endsWith(".js") ? "text/javascript" : path.endsWith(".wasm") ? "application/wasm" : path.endsWith(".json") ? "application/json" : path.endsWith(".css") ? "text/css" : path.endsWith(".html") ? "text/html" : path.endsWith(".png") ? "image/png" : path.endsWith(".svg") ? "image/svg+xml" : path.endsWith(".woff2") ? "font/woff2" : "application/octet-stream";
        try {
            Map<String,String> headers = new HashMap<>();
            headers.put("Cross-Origin-Opener-Policy", "same-origin");
            headers.put("Cross-Origin-Embedder-Policy", "require-corp");
            headers.put("Cross-Origin-Resource-Policy", "same-origin");
            headers.put("Cache-Control", "no-cache");
            String range = request.getRequestHeaders().get("Range");
            if(range == null) range = request.getRequestHeaders().get("range");
            if(range != null) {
                Matcher match = Pattern.compile("bytes=(\\d+)-(\\d+)").matcher(range);
                if(!match.matches()) return empty(416, "Invalid range");
                AssetFileDescriptor fd = getAssets().openFd(assetPath);
                long size = fd.getLength(), start = Long.parseLong(match.group(1)), end = Math.min(size - 1, Long.parseLong(match.group(2)));
                if(start < 0 || start > end) { fd.close(); return empty(416, "Invalid range"); }
                InputStream stream = fd.createInputStream();
                long skipped = 0;
                while(skipped < start) { long n = stream.skip(start - skipped); if(n <= 0) throw new EOFException(); skipped += n; }
                final long length = end - start + 1;
                headers.put("Content-Range", "bytes " + start + "-" + end + "/" + size);
                headers.put("Content-Length", Long.toString(length));
                InputStream limited = new FilterInputStream(stream) {
                    long left = length;
                    @Override public int read() throws IOException { if(left <= 0) return -1; int n = super.read(); if(n >= 0) left--; return n; }
                    @Override public int read(byte[] bytes, int offset, int count) throws IOException { if(left <= 0) return -1; int n = in.read(bytes, offset, (int)Math.min(count, left)); if(n > 0) left -= n; return n; }
                    @Override public void close() throws IOException { try { super.close(); } finally { fd.close(); } }
                };
                return new WebResourceResponse(mime, "UTF-8", 206, "Partial Content", headers, limited);
            }
            return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers, getAssets().open(assetPath));
        } catch(Exception error) { return empty(404, "Not Found"); }
    }
    public class SaveBridge {
        @JavascriptInterface public String exportSave(String name, String content) {
            if(!name.matches("ra2-save-[a-zA-Z0-9-]+\\.json") || content.length() > 128 * 1024 * 1024) return "存档名称或大小无效";
            Uri uri = null;
            try {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, name);
                values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/RA2Mobile");
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if(uri == null) return "无法创建备份文件";
                try(OutputStream out = getContentResolver().openOutputStream(uri)) { out.write(content.getBytes("UTF-8")); }
                values.clear(); values.put(MediaStore.Downloads.IS_PENDING, 0);
                getContentResolver().update(uri, values, null, null);
                return "";
            } catch(Exception error) {
                if(uri != null) getContentResolver().delete(uri, null, null);
                return "备份失败：" + error.getMessage();
            }
        }
    }
    @Override public void onBackPressed() { if(web != null) web.evaluateJavascript("document.dispatchEvent(new Event('mobile-back'))", null); }
    @Override protected void onPause() {
        super.onPause();
        if(web != null) { web.evaluateJavascript("document.dispatchEvent(new Event('mobile-background'))", null); web.onPause(); }
    }
    @Override protected void onResume() { super.onResume(); if(web != null) { web.onResume(); web.evaluateJavascript("document.dispatchEvent(new Event('mobile-foreground'))", null); } }
    @Override protected void onDestroy() { if(web != null) { web.removeJavascriptInterface("RA2Android"); web.destroy(); web = null; } super.onDestroy(); }
}

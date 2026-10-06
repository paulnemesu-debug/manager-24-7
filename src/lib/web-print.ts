/** Print the supplied document; Expo's web adapter prints the application page. */
export function printHtmlInBrowser(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('title', 'Print document');
    frame.setAttribute('aria-hidden', 'true');
    // Keep a rendered document available to print without displaying it in the app.
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;';
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
    let loadTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const cleanup = () => { disposed = true; clearTimeout(cleanupTimer); clearTimeout(loadTimer); frame.onload = null; frame.onerror = null; frame.remove(); };
    const fail = (error: unknown) => { if (!disposed) { cleanup(); reject(error); } };
    loadTimer = setTimeout(() => fail(new Error('Print document could not be loaded.')), 15_000);
    frame.onload = () => {
      // The iframe load event includes its images; fonts may finish afterwards.
      void (async () => {
        await frame.contentDocument?.fonts?.ready;
        if (disposed) return;
        clearTimeout(loadTimer);
        const printWindow = frame.contentWindow;
        if (!printWindow) throw new Error('Print document could not be opened.');
        printWindow.addEventListener('afterprint', cleanup, { once: true });
        cleanupTimer = setTimeout(cleanup, 60_000);
        printWindow.focus();
        printWindow.print();
        resolve();
      })().catch(fail);
    };
    frame.onerror = () => fail(new Error('Print document could not be loaded.'));
    try { frame.srcdoc = html; document.body.appendChild(frame); } catch (error) { fail(error); }
  });
}

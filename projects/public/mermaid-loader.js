(function () {
  let loading = null;

  window.ensureMermaidLoaded = function ensureMermaidLoaded() {
    if (window.mermaid) {
      if (!window.mermaid._yourlabInit) {
        window.mermaid.initialize({ startOnLoad: false, theme: 'dark' });
        window.mermaid._yourlabInit = true;
      }
      return Promise.resolve(window.mermaid);
    }
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
      script.async = true;
      script.onload = () => {
        if (window.mermaid) {
          window.mermaid.initialize({ startOnLoad: false, theme: 'dark' });
          window.mermaid._yourlabInit = true;
          resolve(window.mermaid);
        } else {
          reject(new Error('Mermaid não disponível'));
        }
      };
      script.onerror = () => reject(new Error('Falha ao carregar Mermaid'));
      document.head.appendChild(script);
    });
    return loading;
  };
})();

const originalFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>originalFetch(new URL(input,'http://127.0.0.1:8002').toString(),init);
HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};

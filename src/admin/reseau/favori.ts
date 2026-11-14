// Le favori « Relever sur Doctolib » : code exécuté sur la fiche Doctolib OUVERTE PAR
// L'OPÉRATEUR, quand il clique. Il envoie le texte de cette page au Hub (message entre
// fenêtres), qui l'analyse et le fait vérifier. Aucun parcours automatique.

/** Le favori à glisser dans la barre du navigateur (code exécuté sur la page Doctolib ouverte par l'opérateur). */
export function codeFavori(origineHub: string, cheminHub = "/"): string {
  const code = `(function(){var H=${JSON.stringify(origineHub)},P=${JSON.stringify(cheminHub)};if(!/(^|\\.)doctolib\\.(fr|de|it)$/.test(location.hostname)){alert("Ouvrez d'abord la fiche d'un praticien sur Doctolib, puis cliquez sur ce favori.");return;}var d={type:"avisdoc-doctolib",url:location.href,texte:(document.body.innerText||"").slice(0,80000)};var w=window.open(H+P+"#/reseau-aval/doctolib","avisdoc-doctolib");if(!w){alert("Autorisez l'ouverture de fenêtres pour doctolib.fr.");return;}var n=0,t=setInterval(function(){n++;try{w.postMessage(d,H);}catch(e){}if(n>60)clearInterval(t);},500);window.addEventListener("message",function(e){if(e.origin===H&&e.data==="avisdoc-doctolib-recu")clearInterval(t);});})();`;
  return `javascript:${encodeURIComponent(code)}`;
}


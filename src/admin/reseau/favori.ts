// Le favori « Relever sur Doctolib » : code exécuté sur la page Doctolib OUVERTE PAR
// L'OPÉRATEUR, quand il clique. Il ouvre d'abord les « Voir plus » de CETTE page (comme
// l'opérateur le ferait à la main : présentation, expertises, tarifs, horaires), lit le
// texte, puis l'envoie au Hub (message entre fenêtres), qui l'analyse et le fait vérifier.
// Aucune navigation : il ne quitte jamais la page et ne suit aucun lien. Sur la page de
// prise de rendez-vous (ouverte par l'opérateur, motif choisi), il relève les créneaux.

/** Libellés des boutons qui déplient du contenu sur la page même. */
const DEPLIER = "^(voir plus|afficher plus|lire la suite|voir plus d'horaires|afficher plus d'horaires|plus d'horaires|voir tous les (tarifs|horaires|actes)|\\+ ?\\d+)$";

/** Le favori à glisser dans la barre du navigateur (code exécuté sur la page Doctolib ouverte par l'opérateur). */
export function codeFavori(origineHub: string, cheminHub = "/"): string {
  const code = `(function(){var H=${JSON.stringify(origineHub)},P=${JSON.stringify(cheminHub)},R=new RegExp(${JSON.stringify(DEPLIER)},"i");` +
    `if(!/(^|\\.)doctolib\\.(fr|de|it)$/.test(location.hostname)){alert("Ouvrez d'abord la fiche d'un praticien (ou sa page de prise de rendez-vous) sur Doctolib, puis cliquez sur ce favori.");return;}` +
    // La fenêtre du Hub s'ouvre tout de suite (sinon le navigateur la bloque), puis on déplie.
    `var w=window.open(H+P+"#/reseau-aval/doctolib","avisdoc-doctolib");if(!w){alert("Autorisez l'ouverture de fenêtres pour doctolib.fr.");return;}` +
    `var t0=document.body.innerText||"",parts=[t0];` +
    `var els=[].slice.call(document.querySelectorAll("button,[role=button],a")).filter(function(e){var h=e.tagName==="A"?(e.getAttribute("href")||""):"";return R.test((e.innerText||"").trim())&&e.offsetParent!==null&&(!h||h.charAt(0)==="#");}).slice(0,15);` +
    `var i=0;function suite(){if(i>=els.length){envoyer();return;}var e=els[i++];try{e.click();}catch(x){}setTimeout(function(){parts.push(document.body.innerText||"");` +
    `try{document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));}catch(x){}setTimeout(suite,350);},800);}` +
    `function envoyer(){var d={type:"avisdoc-doctolib",url:location.href,texte:parts.join("\\n§§avisdoc§§\\n").slice(0,250000)};var n=0,t=setInterval(function(){n++;try{w.postMessage(d,H);}catch(e){}if(n>60)clearInterval(t);},500);` +
    `window.addEventListener("message",function(e){if(e.origin===H&&e.data==="avisdoc-doctolib-recu")clearInterval(t);});}suite();})();`;
  return `javascript:${encodeURIComponent(code)}`;
}

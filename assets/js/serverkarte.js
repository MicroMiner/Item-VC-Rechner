"use strict";
(() => {
 const config=window.VELOCITY_CONFIG||{};
 const mapUrl=(value,embedOnly=false)=>{try{const url=new URL(value);return (url.protocol==='https:'||(!embedOnly&&url.protocol==='http:'))&&!url.username&&!url.password?url.href:null;}catch{return null;}};
 const embed=mapUrl(config.blueMapEmbedUrl,true),external=mapUrl(config.blueMapUrl)||embed;
 const link=document.getElementById('mapExternal'),frame=document.getElementById('blueMapFrame'),placeholder=document.getElementById('mapPlaceholder'),message=document.getElementById('mapMessage'),fallback=document.getElementById('mapFallback');
 if(external){link.href=external;link.removeAttribute('aria-disabled');}
 if(!embed){if(external)message.textContent=external.startsWith('http:')?'Die Serverkarte ist in einem neuen Tab erreichbar. Eine direkte Einbettung ist erst mit einer HTTPS-Kartenadresse möglich.':'Öffne die interaktive Serverkarte über den Button in einem neuen Tab.';return;}
 frame.src=embed;frame.hidden=false;placeholder.hidden=true;document.getElementById('mapLive').hidden=false;fallback.hidden=false;
 // Cross-origin iframe load events do not prove availability or detect CSP/X-Frame-Options blocks.
 // Live labels the configured map; it is not a bot/server availability check.
 frame.addEventListener('error',()=>{frame.hidden=true;placeholder.hidden=false;document.getElementById('mapLive').hidden=true;message.textContent='Die eingebettete Karte konnte nicht geladen werden. Bitte öffne sie in einem neuen Tab.';});
 const viewport=document.getElementById('mapViewport'),full=document.getElementById('mapFullscreen');
 if(viewport.requestFullscreen){full.hidden=false;full.addEventListener('click',async()=>{try{if(document.fullscreenElement===viewport)await document.exitFullscreen();else await viewport.requestFullscreen();}catch{fallback.textContent='Vollbild ist hier nicht verfügbar. Du kannst die Karte in einem neuen Tab öffnen.';}});document.addEventListener('fullscreenchange',()=>full.setAttribute('aria-label',document.fullscreenElement===viewport?'Vollbild beenden':'Karte im Vollbild anzeigen'));}
})();

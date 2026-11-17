// Internal developers register reviewed implementations here and in registry.tsx.
// Database configuration selects code; it can never supply executable code/CSS.
export const DEFAULT_DESIGN_ID='tap2serve-classic';
export const DESIGN_CATALOG=Object.freeze([
 {id:DEFAULT_DESIGN_ID,name:'Classic Restaurant',description:'Warm olive, soft ivory and traditional serif headings.',palette:['#285f48','#f0e7d6','#faf9f6','#ffffff','#202b26','#526058','#e5ba72','#285f48'],layout:['rounded','elevated','subtle','comfortable','brand'],fonts:['serif','system','system']},
 {id:'modern-cafe',name:'Modern Café',description:'Terracotta, oat and an inviting editorial menu.',palette:['#98533b','#ead9c4','#f8f3eb','#ffffff','#30271f','#62564a','#be774c','#98533b'],layout:['rounded','elevated','none','comfortable','brand'],fonts:['sans','sans','sans']},
 {id:'luxury-dining',name:'Luxury Dining',description:'Midnight surfaces, champagne accents and generous space.',palette:['#d7b778','#242321','#141413','#20201e','#f7f0e4','#c2b9a9','#d7b778','#d7b778'],layout:['square','outlined','subtle','spacious','brand'],fonts:['serif','system','noto']},
 {id:'minimal',name:'Minimal',description:'Quiet monochrome, crisp lines and a compact list.',palette:['#202020','#ededed','#ffffff','#ffffff','#202020','#595959','#666666','#202020'],layout:['square','compact','subtle','compact','simple'],fonts:['system','system','system']},
 {id:'fast-food',name:'Fast Food',description:'Bold red, golden highlights and playful pill buttons.',palette:['#bb2626','#ffda69','#fff8e7','#ffffff','#34211b','#695449','#e5a600','#bb2626'],layout:['pill','elevated','none','compact','brand'],fonts:['sans','sans','sans']},
 {id:'contemporary-restaurant',name:'Contemporary Restaurant',description:'Deep teal, fresh mint and clean contemporary cards.',palette:['#126861','#d8ece5','#f1f6f3','#ffffff','#183b35','#4f655f','#dc985d','#126861'],layout:['rounded','outlined','subtle','spacious','banner'],fonts:['sans','system','sans']},
].map(entry=>Object.freeze({...entry,validateOptions:options=>Object.keys(options).length===0})));
export const designDefinition=id=>DESIGN_CATALOG.find(entry=>entry.id===id);
export const COLOR_KEYS=['primary','secondary','background','surface','text','muted','accent','button'];
export const SUGGESTED_PALETTES=DESIGN_CATALOG.map(({id,name,palette})=>({id,name,colors:Object.fromEntries(COLOR_KEYS.map((key,index)=>[key,palette[index]]))}));

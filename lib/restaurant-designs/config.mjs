import { DEFAULT_DESIGN_ID, designDefinition, COLOR_KEYS } from './catalog.mjs';
export class DesignError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const fail=(condition,message='Invalid restaurant design configuration.',status=400)=>{if(!condition)throw new DesignError(message,status);};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function keys(value,allowed){fail(object(value)&&Object.keys(value).every(key=>allowed.includes(key)));}
export const DEFAULT_CONFIG=Object.freeze({
 schemaVersion:1,implementationId:DEFAULT_DESIGN_ID,
 colors:{primary:'#285f48',secondary:'#f0e7d6',accent:'#e5ba72',button:'#285f48',background:'#faf9f6',surface:'#ffffff',text:'#202b26',muted:'#526058'},
 typography:{heading:'serif',body:'system',arabic:'system'},
 branding:{logoUrl:'',heroImageUrl:'',backgroundImageUrl:'',gallery:[],heroTitle:{en:'',ar:''}},
 components:{showHero:true,showGallery:false,menuStyle:'cards',buttonStyle:'rounded',cardVariant:'elevated',borders:'subtle',spacing:'comfortable',headerStyle:'brand'},options:{},
});
export function safeAssetUrl(value){
 if(typeof value!=='string'||value.length>1500)return false;if(!value)return true;
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.hash&&!/[\u0000-\u0020\u007f<>"'()\\]/.test(value);}catch{return false;}
}
const luminance=hex=>{const rgb=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
export const contrast=(a,b)=>{const [light,dark]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (light+.05)/(dark+.05);};
export const foreground=hex=>contrast(hex,'#ffffff')>=contrast(hex,'#000000')?'#ffffff':'#000000';
// Preserve every valid authored color; resolve readable foregrounds per surface.
export const readable=(text,background)=>contrast(text,background)>=4.5?text:foreground(background);
export function templateConfig(id,branding){
 const definition=designDefinition(id);fail(definition,'Restaurant design is unavailable.');
 const result=structuredClone(DEFAULT_CONFIG);result.implementationId=id;
 result.colors=Object.fromEntries(COLOR_KEYS.map((key,index)=>[key,definition.palette[index]]));
 const [buttonStyle,cardVariant,borders,spacing,headerStyle]=definition.layout;
 Object.assign(result.components,{buttonStyle,cardVariant,borders,spacing,headerStyle,menuStyle:id==='minimal'?'list':'cards'});
 const [heading,body,arabic]=definition.fonts;result.typography={heading,body,arabic};
 if(branding)result.branding=structuredClone(branding);
 return validateDesign(result);
}
export function validateDesign(input,{allowUnavailable=false}={}){
 fail(object(input)&&JSON.stringify(input).length<=16000);
 keys(input,['schemaVersion','implementationId','colors','typography','branding','components','options']);
 fail(input.schemaVersion===1&&typeof input.implementationId==='string'&&/^[a-z0-9-]{1,64}$/.test(input.implementationId));
 const definition=designDefinition(input.implementationId);fail(allowUnavailable||!!definition,'Restaurant design is unavailable.');
 const result=structuredClone(DEFAULT_CONFIG);result.implementationId=input.implementationId;
 if(input.colors!==undefined){keys(input.colors,Object.keys(result.colors));for(const [key,value] of Object.entries(input.colors)){fail(typeof value==='string'&&/^#[0-9a-fA-F]{6}$/.test(value));result.colors[key]=value.toLowerCase();}}
 if(input.colors?.button===undefined)result.colors.button=result.colors.primary;
 if(input.typography!==undefined){keys(input.typography,Object.keys(result.typography));for(const [key,value] of Object.entries(input.typography)){fail((key==='arabic'?['system','sans','noto']:['system','serif','sans']).includes(value));result.typography[key]=value;}}
 if(input.branding!==undefined){
  keys(input.branding,Object.keys(result.branding));for(const key of ['logoUrl','heroImageUrl','backgroundImageUrl'])if(input.branding[key]!==undefined){fail(safeAssetUrl(input.branding[key]),'Use an HTTPS branding asset URL.');result.branding[key]=input.branding[key];}
  if(input.branding.gallery!==undefined){fail(Array.isArray(input.branding.gallery)&&input.branding.gallery.length<=6&&input.branding.gallery.every(url=>!!url&&safeAssetUrl(url)),'Use up to six HTTPS gallery image URLs.');result.branding.gallery=[...input.branding.gallery];}
  if(input.branding.heroTitle!==undefined){keys(input.branding.heroTitle,['en','ar']);for(const [lang,value] of Object.entries(input.branding.heroTitle)){fail(typeof value==='string'&&value.length<=180);result.branding.heroTitle[lang]=value;}}
 }
 if(input.components!==undefined){
  keys(input.components,Object.keys(result.components));
  for(const key of ['showHero','showGallery'])if(input.components[key]!==undefined){fail(typeof input.components[key]==='boolean');result.components[key]=input.components[key];}
  const choices={menuStyle:['cards','list'],buttonStyle:['square','rounded','pill'],cardVariant:['elevated','outlined','compact'],borders:['none','subtle','strong'],spacing:['compact','comfortable','spacious'],headerStyle:['simple','brand','banner']};
  for(const [key,values] of Object.entries(choices))if(input.components[key]!==undefined){fail(values.includes(input.components[key]));result.components[key]=input.components[key];}
 }
 if(input.options!==undefined){keys(input.options,Object.keys(input.options));fail(definition?definition.validateOptions(input.options):Object.keys(input.options).length===0);result.options=structuredClone(input.options);}
 return result;
}
export function fallbackConfig(restaurant={}){const config=structuredClone(DEFAULT_CONFIG);if(safeAssetUrl(restaurant.logo))config.branding.logoUrl=restaurant.logo;return config;}
export function resolvedDesign(config,restaurant={}){
 if(!config)return fallbackConfig(restaurant);
 try{const safe=validateDesign(config,{allowUnavailable:true});if(!designDefinition(safe.implementationId)){safe.implementationId=DEFAULT_DESIGN_ID;safe.options={};}return safe;}catch{return fallbackConfig(restaurant);}
}
export function designState(restaurant){
 const stored=restaurant.websiteDesign;
 if(!stored)return {version:0,draft:fallbackConfig(restaurant),published:fallbackConfig(restaurant),previous:null,history:[],publishedAt:null,publishedBy:null};
 fail(object(stored)&&Number.isSafeInteger(stored.version)&&stored.version>=0,'Restaurant design state is unavailable.',503);
 return {...structuredClone(stored),draft:resolvedDesign(stored.draft,restaurant),history:structuredClone(stored.history||[])};
}
export const publishedDesign=restaurant=>resolvedDesign(restaurant.websiteDesign?.published,restaurant);
export function designCommand(restaurant,user,body){
 const state=designState(restaurant);
 fail(Number.isSafeInteger(body.expectedVersion)&&body.expectedVersion===state.version,'Restaurant design changed. Refresh before saving.',409);
 const timestamp=new Date().toISOString();
 const action=body.action.replace(/^platform\./,'');
 const snapshot={version:state.publishedVersion??(state.publishedAt?state.version:0),config:resolvedDesign(state.published,restaurant),at:state.publishedAt,by:state.publishedBy};
 if(action==='design.save')state.draft=validateDesign(body.config);
 else if(action==='design.reset')state.draft=fallbackConfig(restaurant);
 else if(action==='design.publish'){
  const draft=validateDesign(state.draft);state.previous=resolvedDesign(state.published,restaurant);state.published=draft;state.publishedAt=timestamp;state.publishedBy=user.id;
 }else if(action==='design.revert'){
  const previous=body.targetVersion===undefined?state.previous:state.history.find(entry=>entry.version===body.targetVersion)?.config;
  fail(previous,'There is no previous published design to revert to.',409);
  state.previous=resolvedDesign(state.published,restaurant);state.published=resolvedDesign(previous,restaurant);state.draft=structuredClone(state.published);state.publishedAt=timestamp;state.publishedBy=user.id;
 }else throw new DesignError('Unknown restaurant design action.');
 if(action==='design.publish'||action==='design.revert'){state.history=[...state.history,snapshot].slice(-20);state.publishedVersion=state.version+1;}
 state.version++;state.updatedAt=timestamp;state.updatedBy=user.id;restaurant.websiteDesign=state;
 return {id:restaurant.id,version:state.version};
}

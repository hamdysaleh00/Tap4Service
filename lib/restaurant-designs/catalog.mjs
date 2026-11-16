// Internal developers register reviewed implementations here and in registry.tsx.
// Database configuration selects code; it can never supply executable code/CSS.
export const DEFAULT_DESIGN_ID='tap2serve-classic';
export const DESIGN_CATALOG=Object.freeze([
 {id:DEFAULT_DESIGN_ID,name:'Tap2Serve Classic',description:'The existing shared restaurant presentation.',validateOptions:options=>Object.keys(options).length===0},
]);
export const designDefinition=id=>DESIGN_CATALOG.find(entry=>entry.id===id);

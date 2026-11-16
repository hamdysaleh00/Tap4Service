import { publishedDesign } from './restaurant-designs/config.mjs';
export function publicView(t){return {appearance:publishedDesign(t),categoryNames:t.categoryNames||{},id:t.id,slug:t.slug,name:t.name,nameAr:t.nameAr||'',tagline:t.tagline,taglineAr:t.taglineAr||'',logo:publishedDesign(t).branding.logoUrl,currency:t.currency,categories:t.categories,menu:t.menu.filter(m=>m.visible)};}

import type { DesignImplementation } from './types';
import { DEFAULT_DESIGN_ID } from '../../lib/restaurant-designs/catalog.mjs';
import { ClassicSite, ClassicShell, ClassicHero, ClassicMenuCard } from './classic';
// Static imports only. Register internal, reviewed implementations by catalog ID.
export const DESIGN_IMPLEMENTATIONS:Record<string,DesignImplementation>={
 [DEFAULT_DESIGN_ID]:{Site:ClassicSite,GuestShell:ClassicShell,Hero:ClassicHero,MenuCard:ClassicMenuCard},
 ...Object.fromEntries(['modern-cafe','luxury-dining','minimal','fast-food','contemporary-restaurant'].map(id=>[id,{Site:ClassicSite,GuestShell:ClassicShell,Hero:ClassicHero,MenuCard:ClassicMenuCard}])),
};
export function implementationFor(id:string){return DESIGN_IMPLEMENTATIONS[id]||DESIGN_IMPLEMENTATIONS[DEFAULT_DESIGN_ID];}

import type { ReactNode, ComponentType } from 'react';
export type DesignConfig={schemaVersion:number;implementationId:string;colors:Record<'primary'|'accent'|'background'|'surface'|'text'|'muted',string>;typography:Record<'heading'|'body'|'arabic',string>;branding:{logoUrl:string;heroImageUrl:string;backgroundImageUrl:string;gallery:string[];heroTitle:{en:string;ar:string}};components:{showHero:boolean;showGallery:boolean;menuStyle:string};options:Record<string,unknown>};
export type RestaurantContent={id?:string;name:string;nameAr?:string;tagline:string;taglineAr?:string;logo?:string;currency:string;categories:string[];categoryNames?:Record<string,string>;menu:MenuContent[];appearance?:DesignConfig};
export type MenuContent={id:string;name:string;nameAr?:string;description:string;descriptionAr?:string;category:string;price:number;image?:string;available:boolean};
export type DesignProps={restaurant:RestaurantContent;config:DesignConfig};
export type ShellProps=DesignProps&{children:ReactNode};
export type GuestSlots={header:ReactNode;content:ReactNode;navigation:ReactNode;floating:ReactNode;overlays:ReactNode};
export type GuestLayoutProps=DesignProps&GuestSlots;
export type CardProps=DesignProps&{item:MenuContent;children?:ReactNode};
// All financial/session state and mutation handlers stay in the shared app.
// Implementations receive public content and React slots, never repository APIs.
export type DesignImplementation={Site:ComponentType<DesignProps>;GuestShell:ComponentType<GuestLayoutProps>;Hero:ComponentType<DesignProps>;MenuCard:ComponentType<CardProps>};

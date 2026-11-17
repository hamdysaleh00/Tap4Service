'use client';
import React, { type CSSProperties } from 'react';
import { resolvedDesign, foreground, readable } from '../../lib/restaurant-designs/config.mjs';
import { DEFAULT_DESIGN_ID } from '../../lib/restaurant-designs/catalog.mjs';
import { implementationFor } from './registry';
import { useI18n } from '../i18n';
import type { ShellProps, CardProps, DesignConfig, RestaurantContent, GuestSlots } from './types';
const fonts:Record<string,string>={system:'system-ui, sans-serif',sans:'Arial, Tahoma, sans-serif',serif:'Georgia, "Times New Roman", serif',noto:'"Traditional Arabic", "Noto Naskh Arabic", serif'};
function Theme({restaurant,config,children}:ShellProps){
 const {language}=useI18n();
 const style={
  '--design-primary':config.colors.primary,'--design-secondary':config.colors.secondary,'--design-on-secondary':readable(config.colors.text,config.colors.secondary),'--design-on-brand':foreground(config.colors.primary),
  '--design-accent':config.colors.accent,'--design-button':config.colors.button,'--design-on-button':foreground(config.colors.button),
  '--design-bg':config.colors.background,'--design-surface':config.colors.surface,'--design-text':readable(config.colors.text,config.colors.background),'--design-muted':readable(config.colors.muted,config.colors.background),
  '--design-surface-text':readable(config.colors.text,config.colors.surface),'--design-surface-muted':readable(config.colors.muted,config.colors.surface),'--design-link':readable(config.colors.primary,config.colors.surface),
  '--design-radius':({square:'0px',rounded:'12px',pill:'999px'})[config.components.buttonStyle as 'square'|'rounded'|'pill'],
  '--design-space':({compact:'12px',comfortable:'20px',spacious:'32px'})[config.components.spacing as 'compact'|'comfortable'|'spacious'],
  '--design-border-width':({none:'0px',subtle:'1px',strong:'2px'})[config.components.borders as 'none'|'subtle'|'strong'],
  '--design-body':fonts[language==='ar'?config.typography.arabic:config.typography.body],
  '--design-heading':fonts[language==='ar'?config.typography.arabic:config.typography.heading],
  ...(config.branding.backgroundImageUrl?{backgroundImage:`url("${config.branding.backgroundImageUrl}")`}:{}),
 } as CSSProperties;
 return <div className="restaurant-design" data-design={config.implementationId} data-menu-style={config.components.menuStyle} data-card={config.components.cardVariant} data-header={config.components.headerStyle} lang={language} dir={language==='ar'?'rtl':'ltr'} style={style}>{children}</div>;
}
// A removed/failed custom implementation falls back without hiding ordering.
class DesignBoundary extends React.Component<{fallback:React.ReactNode;children:React.ReactNode},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?this.props.fallback:this.props.children;}
}
function effective(restaurant:RestaurantContent,config?:DesignConfig){return resolvedDesign(config||restaurant.appearance,restaurant);}
export function RestaurantWebsite({restaurant,config}: {restaurant:RestaurantContent;config?:DesignConfig}){
 const appearance=effective(restaurant,config),implementation=implementationFor(appearance.implementationId),fallback=implementationFor(DEFAULT_DESIGN_ID);
 return <Theme restaurant={restaurant} config={appearance}><DesignBoundary key={appearance.implementationId} fallback={<fallback.Site restaurant={restaurant} config={appearance}/>}><implementation.Site restaurant={restaurant} config={appearance}/></DesignBoundary></Theme>;
}
export function RestaurantGuestShell({restaurant,...slots}: {restaurant:RestaurantContent}&GuestSlots){
 const config=effective(restaurant),implementation=implementationFor(config.implementationId),fallback=implementationFor(DEFAULT_DESIGN_ID);
 return <Theme restaurant={restaurant} config={config}><DesignBoundary key={config.implementationId} fallback={<fallback.GuestShell restaurant={restaurant} config={config} {...slots}/>}><implementation.GuestShell restaurant={restaurant} config={config} {...slots}/></DesignBoundary></Theme>;
}
export function RestaurantHero({restaurant}:{restaurant:RestaurantContent}){
 const config=effective(restaurant),implementation=implementationFor(config.implementationId),fallback=implementationFor(DEFAULT_DESIGN_ID);
 return <DesignBoundary key={config.implementationId} fallback={<fallback.Hero restaurant={restaurant} config={config}/>}><implementation.Hero restaurant={restaurant} config={config}/></DesignBoundary>;
}
export function RestaurantMenuCard({restaurant,item,children}:Omit<CardProps,'config'>){
 const config=effective(restaurant),implementation=implementationFor(config.implementationId),fallback=implementationFor(DEFAULT_DESIGN_ID);
 return <DesignBoundary key={config.implementationId} fallback={<fallback.MenuCard restaurant={restaurant} item={item} config={config}>{children}</fallback.MenuCard>}><implementation.MenuCard restaurant={restaurant} item={item} config={config}>{children}</implementation.MenuCard></DesignBoundary>;
}

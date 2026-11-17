'use client';
import { LanguageSwitcher, useI18n } from '../i18n';
import Link from 'next/link';
import type { DesignProps, GuestLayoutProps, CardProps } from './types';
export function ClassicShell({header,content,navigation,floating,overlays}:GuestLayoutProps){return <div className="guest-app">{header}{content}{floating}{navigation}{overlays}</div>;}
export function ClassicHero({restaurant,config}:DesignProps){
 const {t,content,language}=useI18n();if(!config.components.showHero)return null;
 const title=config.branding.heroTitle[language as 'en'|'ar']||config.branding.heroTitle.en;
 const image=config.branding.heroImageUrl||restaurant.menu.find(item=>item.image)?.image;
 return <section className="guest-hero design-hero"><div><h1>{title||content(restaurant)}</h1><p>{content(restaurant,'tagline')}</p></div>{image&&<div className="hero-image"><img src={image} alt={t('Freshly prepared food')}/></div>}</section>;
}
export function ClassicMenuCard({restaurant,config,item,children}:CardProps){
 const {content,money,t,language}=useI18n();
 return <article className={`dish ${!item.available?'unavailable':''}`}>
  {item.image&&<div className="dish-image"><img src={item.image} alt={content(item)} loading="lazy"/></div>}
  <div className="dish-content"><small>{language==='ar'?restaurant.categoryNames?.[item.category]||item.category:item.category}</small><h3>{content(item)}</h3><p>{content(item,'description')}</p><div><strong>{money(item.price)} <small>{restaurant.currency}</small></strong>{children}</div>{!item.available&&<span>{t('Out of stock')}</span>}</div>
 </article>;
}
export function ClassicSite({restaurant,config}:DesignProps){
 const {content,t,language}=useI18n();
 return <main className="design-site">
  <header className="design-site-header"><Link href="/" className="guest-brand">{config.branding.logoUrl&&<img src={config.branding.logoUrl} alt=""/>}<strong>{content(restaurant)}</strong></Link><LanguageSwitcher/><a href="/dashboard">{t('Staff dashboard')}</a></header>
  <ClassicHero restaurant={restaurant} config={config}/>
  <p>{t('Scan or tap your table’s QR / NFC stand to order.')}</p>
  {config.components.showGallery&&config.branding.gallery.length>0&&<section className="design-gallery" aria-label={t('Restaurant gallery')}>{config.branding.gallery.map((url,index)=><img key={`${url}-${index}`} src={url} alt={`${content(restaurant)} ${index+1}`} loading="lazy"/>)}</section>}
  {restaurant.categories.map(category=><section key={category} className="design-category"><h2>{language==='ar'?restaurant.categoryNames?.[category]||category:category}</h2><div className="guest-menu-grid">{restaurant.menu.filter(item=>item.category===category).map(item=><ClassicMenuCard key={item.id} item={item} restaurant={restaurant} config={config}/>)}</div></section>)}
  {!restaurant.menu.length&&<p>{t('The menu is getting ready')}</p>}
 </main>;
}

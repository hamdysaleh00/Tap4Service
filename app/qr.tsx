'use client';
import {useI18n,LanguageSwitcher} from './i18n';
import {useEffect,useState} from 'react';
import QRCode from 'qrcode';
export default function TableQR({url}:{url:string}){
 const {t:tr,money,time,elapsed,language,content,date,setIdentity}=useI18n();
const [src,setSrc]=useState('');useEffect(()=>{QRCode.toDataURL(url,{width:300,margin:2,color:{dark:'#263e30',light:'#ffffff'}}).then(setSrc)},[url]);return src?<img className="qr-image" src={src} alt={tr("Scan to open this table’s menu")}/>:<p>{tr("Preparing QR code…")}</p>}

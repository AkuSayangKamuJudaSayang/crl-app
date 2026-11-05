'use client';
import {useMemo} from 'react';
import qrcode from '../lib/vendor/qrcode.mjs';
export default function AuthenticatorQr({value,className}){const image=useMemo(()=>{if(!value)return '';const qr=qrcode(0,'M');qr.addData(value);qr.make();return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(qr.createSvgTag({cellSize:5,margin:20,scalable:true}));},[value]);return image?<img src={image} width="240" height="240" className={className} style={{maxWidth:'100%',height:'auto',background:'#fff',borderRadius:12}} alt="Scan with your authenticator app"/>:null;}

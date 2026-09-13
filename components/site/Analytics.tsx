"use client";

import { useEffect, useState } from "react";
import Script from "next/script";

/**
 * @dynamic Analytics & pixels from Settings → «Analytics & pixels». Nothing
 * loads until the visitor accepts analytics/marketing cookies (CookieConsent
 * writes `euronics.consent.v1`; a `eu:consent` event fires on change).
 * With Consent Mode v2 on, gtag gets a default «denied» first.
 */
export interface AnalyticsIds {
  ga4?: string;
  gtm?: string;
  googleAds?: string;
  metaPixel?: string;
  tiktokPixel?: string;
  clarity?: string;
  hotjar?: string;
  consentMode?: boolean;
}

const CONSENT_KEY = "euronics.consent.v1";

function readConsent(): { analytics: boolean; marketing: boolean } | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    return raw ? (JSON.parse(raw) as { analytics: boolean; marketing: boolean }) : null;
  } catch {
    return null;
  }
}

export function Analytics(ids: AnalyticsIds) {
  const [consent, setConsent] = useState<{ analytics: boolean; marketing: boolean } | null>(null);
  useEffect(() => {
    const sync = () => setConsent(readConsent());
    sync();
    window.addEventListener("eu:consent", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("eu:consent", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const hasGoogle = !!(ids.ga4 || ids.gtm || ids.googleAds);
  if (!hasGoogle && !ids.metaPixel && !ids.tiktokPixel && !ids.clarity && !ids.hotjar) return null;
  const analytics = !!consent?.analytics;
  const marketing = !!consent?.marketing;
  return (
    <>
      {hasGoogle && ids.consentMode && (
        <Script id="eu-consent-default" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)};gtag('consent','default',{ad_storage:'${marketing ? "granted" : "denied"}',ad_user_data:'${marketing ? "granted" : "denied"}',ad_personalization:'${marketing ? "granted" : "denied"}',analytics_storage:'${analytics ? "granted" : "denied"}',wait_for_update:500});`}</Script>
      )}
      {analytics && ids.gtm && (
        <Script id="eu-gtm" strategy="afterInteractive">{`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${ids.gtm}');`}</Script>
      )}
      {analytics && !ids.gtm && (ids.ga4 || ids.googleAds) && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ids.ga4 ?? ids.googleAds}`} strategy="afterInteractive" />
          <Script id="eu-gtag" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)};gtag('js',new Date());${ids.ga4 ? `gtag('config','${ids.ga4}');` : ""}${ids.googleAds && marketing ? `gtag('config','${ids.googleAds}');` : ""}`}</Script>
        </>
      )}
      {marketing && ids.metaPixel && (
        <Script id="eu-meta" strategy="afterInteractive">{`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${ids.metaPixel}');fbq('track','PageView');`}</Script>
      )}
      {marketing && ids.tiktokPixel && (
        <Script id="eu-tiktok" strategy="afterInteractive">{`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${ids.tiktokPixel}');ttq.page();}(window,document,'ttq');`}</Script>
      )}
      {analytics && ids.clarity && (
        <Script id="eu-clarity" strategy="afterInteractive">{`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${ids.clarity}");`}</Script>
      )}
      {analytics && ids.hotjar && (
        <Script id="eu-hotjar" strategy="afterInteractive">{`(function(h,o,t,j,a,r){h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};h._hjSettings={hjid:${Number(ids.hotjar)},hjsv:6};a=o.getElementsByTagName('head')[0];r=o.createElement('script');r.async=1;r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;a.appendChild(r);})(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');`}</Script>
      )}
    </>
  );
}

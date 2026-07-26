import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.adityaraj.sbpdcl',
  appName: 'Bijli Recharge',
  webDir: 'dist',
  cordova: {
    preferences: {
      AllowedSchemes: 'upi,tez,paytmmp,phonepe,gpay,bhim,amazonpay,credpay,mobikwik,induspay,iMobile,axispay,slicepay,fampay,navi,myairtel,bajajfinservmarkets,lotza,olamoney,snapchat'
    }
  }
};

export default config;

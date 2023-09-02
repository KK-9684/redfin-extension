import {
  IMH_GOOGLE_SHEET_WEB_APP_URL,
} from '../../consts/localStorage.consts.js';
import { NOTIFICATION_TYPES } from '../notification/notification.service.js';

export class GoogleSheetService {
  notificationService;
  constructor(notificationService) {
    this.notificationService = notificationService;
  }

  /*********************************************/
  /*******Store data on Google Sheet************/
  /*********************************************/
  async storeDataToGoogleSheet(data, googleSheetName) {
    // const WEB_URL_DEPLOYED = 'https://script.google.com/macros/s/AKfycbynMn1HLl0xkXLlYG7XgsWi6oo14bdWICv6QxdhIFS17HqGOojl4kqJh3YwZwzk_k8f2g/exec';
    // const WEB_URL_DEPLOYED = 'https://script.google.com/macros/s/AKfycbx2VtB_vjQGX5r-ikKu3aSHE1Y25Hofd_OHGEbVqF8kHqDbnOT6333YD2AZpsqAotk0_g/exec';
    // const WEB_URL_DEPLOYED = 'https://script.google.com/macros/s/AKfycbwfjuG53jmTsjjQDKhTgThENrhrl-fp0brywfgGaATazfxZAhZ08iIcCkCMApJ4EYU7_g/exec';

    const WEB_URL_DEPLOYED = localStorage.getItem(IMH_GOOGLE_SHEET_WEB_APP_URL);
    if (!WEB_URL_DEPLOYED) {
      alert('The Google Sheet Web App URL not set.');
      return;
    }

    if (!googleSheetName) {
      alert('The Google Sheet Name not set.');
      return;
    }
    var formBody = [];
    // var formBody = '';
    for (let i = 0; i < data.length; i++) {
      data[i].googleSheetName = googleSheetName;
      const itemBody = JSON.stringify(data[i]);
      const encoded = encodeURIComponent(itemBody);
      formBody.push(`${i}=${encoded}`);
    }
    // for (var property in data) {
    //     var encodedKey = encodeURIComponent(property);
    //     var encodedValue = encodeURIComponent(data[property]);
    //     formBody.push(encodedKey + "=" + encodedValue);
    // }
    formBody = formBody.join("&");

    const rawResponse = await fetch(WEB_URL_DEPLOYED, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      },
      body: formBody
    })

    const resContent = await rawResponse.json();
    // console.log(resContent);

    if (resContent && resContent.result === 'success') {
      this.notificationService.notify(`Properties added to lines: ${resContent.rows.join(', ')}`, NOTIFICATION_TYPES.SUCCESS);
    } else if (resContent && resContent.result === 'error') {
      this.notificationService.notify(`There was an error: ${resContent.error}`, NOTIFICATION_TYPES.ERROR);
    } else {
      this.notificationService.notify(`There was an warning: ${JSON.stringify(resContent)}`, NOTIFICATION_TYPES.WARNING);
    }

    return resContent;
  }
}
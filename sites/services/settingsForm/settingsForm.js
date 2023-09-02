
import {
  IMH_GOOGLE_SHEET_WEB_APP_URL,
  IMH_GOOGLE_SHEET_NAME,
  IMH_AUTOMATION_GOOGLE_SHEET_NAME,
  IMH_KM_DISTANCE_TO_COMPARISON,
  IMH_PRECENTAGE_UNDER_AVG_TO_COMPARISON,
  IMH_MAX_HOME_PRICE_TO_COMPARISON,
  IMH_PRECENTAGE_PRICE_TO_SQF_AVG_TO_COMPARISON,
  IMH_MINIMUM_PROPERTIES_TO_COMPS,
  IMH_MINIMUM_DAYS_ON_MARKET,
  IMH_MAXIMUM_DAYS_ON_MARKET,
  IMH_REHAB_SQF_PRICE_SMALL,
  IMH_REHAB_SQF_PRICE_MEDIUM,
  IMH_REHAB_SQF_PRICE_BIG,
} from '../../consts/localStorage.consts.js';
import { NOTIFICATION_TYPES } from '../notification/notification.service.js';

export class SettingFrom {
  formFieldList = [];
  floatingMenu;
  divSettingsContent;
  formSettings;
  notificationService;

  constructor(notificationService, floatingMenu) {
    this.notificationService = notificationService;
    this.floatingMenu = floatingMenu;
    this.createSettingsWrapperElement();
  }

  createSettingsWrapperElement() {
    const divWrapper = document.createElement('div');
    divWrapper.id = 'imh-settings--wrapper';
    divWrapper.classList.add('imh-settings--wrapper');

    const closeButton = $(`
    <button class="imh-close-button">
        <svg style="width:24px;height:24px" viewBox="0 0 24 24">
            <path fill="currentColor" d="M13.46,12L19,17.54V19H17.54L12,13.46L6.46,19H5V17.54L10.54,12L5,6.46V5H6.46L12,10.54L17.54,5H19V6.46L13.46,12Z" />
        </svg>
    </button>`);
    closeButton.on('click', () => this.onSettingsToggleClicked());
    $(document).on('keyup', (e) => {
        if (e.key == "Escape") {
            this.closeElement(divWrapper.id);
        }
      });

    $(divWrapper).append(closeButton);

    document.body.appendChild(divWrapper);

    this.divSettingsContent = document.createElement('div');
    this.divSettingsContent.id = 'imh_results';
    this.divSettingsContent.classList.add('imh-settings--content');
    divWrapper.appendChild(this.divSettingsContent);

    this.floatingMenu.addItemToFloatingMenu('imh-settings--toggle-button', 
    `<svg style="width:24px;height:24px" viewBox="0 0 24 24">
        <path fill="currentColor" d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z" />
    </svg>`,
    this.onSettingsToggleClicked);

    const formSettings = this.createAndGetFormSettings(this.divSettingsContent);
    this.formSettings = formSettings;
    this.divSettingsContent.appendChild(formSettings);
  }

  onSettingsToggleClicked() {
    const divWrapper = $('.imh-settings--wrapper');
    if (divWrapper.length > 0) {
        if (divWrapper[0].classList.contains('is-open')) {
            divWrapper[0].classList.remove('is-open');
        } else {
            divWrapper[0].classList.add('is-open');
        }
    }
  }

  createAndGetFormSettings() {
    const form = document.createElement("form");

    this.addFormField(form, 'text', null, 'google_sheet_web_app_url', 'webAppUrl', 'Google Sheet Web App URL:', IMH_GOOGLE_SHEET_WEB_APP_URL);
    this.addFormField(form, 'text', null, 'google_sheet_name', 'sheetName', 'Sheet Name:', IMH_GOOGLE_SHEET_NAME);
    this.addFormField(form, 'text', null, 'automation_google_sheet_name', 'automationSheetName', 'Automation Sheet Name:', IMH_AUTOMATION_GOOGLE_SHEET_NAME);
    this.addFormField(form, 'number', '0.001', 'rehub_sqf_price_small', 'rehubSqfPriceSmall', 'Rehab SQF Price - Small:', IMH_REHAB_SQF_PRICE_SMALL);
    this.addFormField(form, 'number', '0.001', 'rehub_sqf_price_medium', 'rehubSqfPriceMedium', 'Rehab SQF Price - Medium:', IMH_REHAB_SQF_PRICE_MEDIUM);
    this.addFormField(form, 'number', '0.001', 'rehub_sqf_price_big', 'rehubSqfPriceBig', 'Rehab SQF Price - Big:', IMH_REHAB_SQF_PRICE_BIG);
    this.addFormField(form, 'number', '0.001', 'max_home_price_comp_field', 'max_home_price_comp', 'Max Home Price:', IMH_MAX_HOME_PRICE_TO_COMPARISON);
    this.addFormField(form, 'number', null, 'min_props_to_coms_field', 'min_props_to_coms', 'Minimum Properties to Comps:', IMH_MINIMUM_PROPERTIES_TO_COMPS);
    this.addFormField(form, 'number', '0.001', 'pre_und_avg_comp_field', 'pre_und_avg_comp', 'Precente under AVG:', IMH_PRECENTAGE_UNDER_AVG_TO_COMPARISON);
    this.addFormField(form, 'number', '0.01', 'pre_und_sqf_price_comp_field', 'pre_und_sqf_price_comp', 'Precente under SQF AVG:', IMH_PRECENTAGE_PRICE_TO_SQF_AVG_TO_COMPARISON);
    this.addFormField(form, 'number', '0.01', 'km_distance_comp_field', 'km_distance_comp', 'KM distance comp:', IMH_KM_DISTANCE_TO_COMPARISON);
    this.addFormField(form, 'number', null, 'min_days_on_market_field', 'min_days_on_market', 'Minimum Days On Market:', IMH_MINIMUM_DAYS_ON_MARKET);
    this.addFormField(form, 'number', null, 'max_days_on_market_field', 'max_days_on_market', 'Maximum Days On Market:', IMH_MAXIMUM_DAYS_ON_MARKET);

    const saveButton = document.createElement("button");
    saveButton.setAttribute('type', "submit");
    saveButton.innerHTML = 'Save';
    form.appendChild(saveButton);

    form.addEventListener("submit", (e) => {
        e.preventDefault();

        this.formFieldList.forEach(field => {
          const value = $(`#${field.id}`).val();
          localStorage.setItem(field.localStorageKey, value);
        });        

        this.notificationService.notify(`Setting saved`, NOTIFICATION_TYPES.SUCCESS);
    });
    return form;
  }

  addFormField(form, type, step, id, name, label, localStorageKey) {
    const value = localStorage.getItem(localStorageKey);

    const labelElm = document.createElement("label");
    labelElm.setAttribute('for', id);
    labelElm.innerHTML = label;
    form.appendChild(labelElm);

    const inputElm = document.createElement("input");
    inputElm.setAttribute('id', id);
    inputElm.setAttribute('type', type);
    if (step) {
      inputElm.setAttribute('step', step);
    }
    inputElm.setAttribute('name', name);
    inputElm.value = value;
    form.appendChild(inputElm);

    this.formFieldList.push({
      localStorageKey,
      id
    })
  }

  closeElement(elementId) {
    const divWrapper = $(`#${elementId}`);
    if (divWrapper.length > 0) {
        divWrapper[0].classList.remove('is-open');
    }
  }

  getGoogleSheetName() {
    return localStorage.getItem(IMH_GOOGLE_SHEET_NAME);
  }
  
  getAutomationGoogleSheetName() {
    return localStorage.getItem(IMH_AUTOMATION_GOOGLE_SHEET_NAME);
  }

  getMinimumTimeOnMarket() {
    return localStorage.getItem(IMH_MINIMUM_DAYS_ON_MARKET);
  }

  getMaximumTimeOnMarket() {
    return localStorage.getItem(IMH_MAXIMUM_DAYS_ON_MARKET);
  }

  getRehubSqfPrice() {
    return {
      small: localStorage.getItem(IMH_REHAB_SQF_PRICE_SMALL),
      medium: localStorage.getItem(IMH_REHAB_SQF_PRICE_MEDIUM),
      big: localStorage.getItem(IMH_REHAB_SQF_PRICE_BIG),
    }
  }
}
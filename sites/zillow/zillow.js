import { NotificationService, NOTIFICATION_TYPES } from '../services/notification/notification.service.js';
import { FloatingMenu } from '../services/floatingMenu/floatingMenu.js';
import { SettingFrom } from '../services/settingsForm/settingsForm.js';
import { GoogleSheetService } from '../services/googleSheet/googleSheet.service.js';
import { CompsViews } from '../services/compsViews/compsViews.js';
import {
  IMH_MAX_HOME_PRICE_TO_COMPARISON,
} from '../consts/localStorage.consts.js';
import { MOTIVATION_KEYWORDS } from '../consts/motivationKeywords.consts.js';

(function ($) {
  const SEARCH_TYPE = {
    SALE: 'Sale',
    SOLD: 'Sold',
    RENT: 'Rent',
  }

  const SITE_CONFIG = {
    ZILLOW_MAX_RESULTS: 500
  };


  const services = {
    floatingMenu: null,
    settingFrom: null,
    notificationService: null,
    googleSheetService: null,
    compsViews: null,
  };

  // Handle last search properties with transformed data
  let lastSearchPropResultHash = {
    sale: null,
    sold: null,
  };

  // Handle fetch properties - hash map by property id
  const propertiesDetailsHash = {};

  const cachedImhPropsData = {
    sale: {},
    sold: {},
  };


  function init() {
    services.notificationService = new NotificationService();
    services.floatingMenu = new FloatingMenu($('body'));
    services.settingFrom = new SettingFrom(services.notificationService, services.floatingMenu);
    services.googleSheetService = new GoogleSheetService(services.notificationService);

    services.floatingMenu.addItemToFloatingMenu('imh--upload-properties-button', `<svg style="width:24px;height:24px" viewBox="0 0 24 24">
        <path fill="currentColor" d="M9,14V8H5L12,1L19,8H15V14H9M5,18V16H19V18H5M19,20H5V22H19V20Z" />
    </svg>`, onUploadPropertiesClicked, 'imh--upload-properties-button');

    services.compsViews = new CompsViews(services.settingFrom, services.floatingMenu, services.googleSheetService);

    overrideGlobalFetch();
  }

  /**
   * Upload all cachedImhPropsData.sale to Google sheet automation sheet name
   */
  async function onUploadPropertiesClicked() {
    try {
      services.floatingMenu.updateButtonLoading('imh--upload-properties-button', true);
      const googleSheetName = services.settingFrom.getAutomationGoogleSheetName();
      let list = [];
      Object.values(cachedImhPropsData.sale).forEach(prop => {
        if (prop.isPropDataFetched) {
          list.push(prop.imhData);
        }
      })
      await services.googleSheetService.storeDataToGoogleSheet(list, googleSheetName);
    } catch (ex) {
      console.error(ex);
    }
    services.floatingMenu.updateButtonLoading('imh--upload-properties-button', false);
  }

  /**
   * Create Proxy of fetch method
   */
  function overrideGlobalFetch() {
    const constantMock = window.fetch;
    window.fetch = async function (...args) {
      const resInterceptorReq = interceptorRequest(args);
      if (resInterceptorReq.callBefore) {
        await resInterceptorReq.callBefore();
      }
      return new Promise((resolve, reject) => {
        constantMock.apply(this, args).then(async (response) => {
          const clonedRes = response.clone();
          const res = await clonedRes.json();
          const resInterceptorRes = await interceptorResponse(args, res);
          resolve(response);
          if (resInterceptorReq.callAfter) {
            await resInterceptorReq.callAfter();
          }
          if (resInterceptorRes.callAfter) {
            await resInterceptorRes.callAfter();
          }

        }).catch((error) => {
          console.error(error);
          reject(error);
        });
      });
    }
  }

  /**
   * Intercept fetch requests, if the args contains args[1]?.imhExtraData?.skipInterceptorRequest skip on the interceptor
   * @param {*} args - request params, and imhExtraData
   * @returns 
   */
  function interceptorRequest(args) {
    const resInterceptor = {
      callBefore: null,
      callAfter: null
    };
    if (!args[1]?.imhExtraData?.skipInterceptorRequest) {
      if (args[0].indexOf("/GetSearchPageState") > -1) {
        resInterceptor.callAfter = onGetSearchPageStateRequest(args);
      }
    }

    return resInterceptor;
  }

  /**
   * Itercept fetch responsed, if args contains args[1]?.imhExtraData?.skipInterceptorResponse skip on the interceptor
   * @param {*} args - response params, and imhExtraData
   * @param {*} response - the response data
   * @returns 
   */
  async function interceptorResponse(args, response) {
    const resInterceptor = {
      callAfter: null
    };
    if (!args[1]?.imhExtraData?.skipInterceptorResponse) {
      if (args[0].indexOf("/GetSearchPageState") > -1) {
        resInterceptor.callAfter = await onGetSearchPageStateResponse(args, response);
      }
    }

    return resInterceptor;
  }

  /**
   * On search page request build sold request and and return it as function
   * @param {*} args - Request arguments
   * @returns - Callback function of request to sell properties
   */
  function onGetSearchPageStateRequest(args) {
    // Set default Search type
    let searchType = SEARCH_TYPE.SALE;
    let requestUrl = extractUrlOfGetSearchPageStateRequest(args);
    let queryParams = extractPramsOfGetSearchPageStateRequest(args);
    if (queryParams) {
      // Build params to sold request
      let buildNewQuery = '';
      for (let param of queryParams) {
        const key = param[0];
        const val = JSON.parse(param[1]);
        if (key === 'searchQueryState') {
          const filterState = val.filterState;
          searchType = detectSearchType(filterState);

          if (searchType === SEARCH_TYPE.SALE) {
            // If the search is type of sale, create sold request
            updateParamsToSearchSoldRequestBaseSellSearch(filterState);
          }
        }
        const valQuery = encodeURIComponent(JSON.stringify(val));
        buildNewQuery += buildNewQuery ? `&${key}=${valQuery}` : `${key}=${valQuery}`;
      }

      if (searchType === SEARCH_TYPE.SALE) {
        // If the search is type of SALE, reset the sold properties list
        lastSearchPropResultHash = {
          sale: null,
          sold: null,
        };
        let reqUrl = `${requestUrl}?${buildNewQuery}`;
        return () => callGet(reqUrl, {
          makePreviouslyCall: true,
          previoslyReq: args[0]
        });
      }
    }
  }

  /**
   * Interceptor of onGetSearchPageState Response
   * Detect search type and call to appropriate method
   * At the end call to updateUIItems to update cards properties
   * If args[1]?.imhExtraData?.makePreviouslyCall && args[1]?.imhExtraData?.previoslyReq return callback of the request
   * @param {*} args - Request arguments
   * @param {*} response - Response of the request
   * @returns - If needs to call previous request return callback
   */
  async function onGetSearchPageStateResponse(args, response) {
    const keywordsSearch = extractKeywordsSearchFromRequest(args);

    let searchType = SEARCH_TYPE.SALE;
    let params = extractPramsOfGetSearchPageStateRequest(args);
    if (params) {
      for (let param of params) {
        const val = JSON.parse(param[1]);
        const category = val?.category || 'cat1';
        const key = param[0];
        if (key === 'searchQueryState') {
          if (response[category]?.searchList?.totalResultCount > SITE_CONFIG.ZILLOW_MAX_RESULTS) {
            services.notificationService.notify(`There are too much results, please zoomin`, NOTIFICATION_TYPES.ERROR);
          }

          const filterState = val.filterState;
          searchType = detectSearchType(filterState);
          switch (searchType) {
            case SEARCH_TYPE.SALE: {
              await onGetSearchPageStateResponseSale(response, category);
              break;
            }
            case SEARCH_TYPE.SOLD: {
              onGetSearchPageStateResponseSold(response, category);
              break;
            }
          }
        }
      }
    }
    updateUIItems();

    if (args[1]?.imhExtraData?.makePreviouslyCall && args[1]?.imhExtraData?.previoslyReq) {
      return () => callGet(args[1].imhExtraData.previoslyReq, {
        skipInterceptorRequest: true,
        skipInterceptorResponse: args[0]
      });
    }
  }

  /**
   * Interceptor of onGetSearchPageState Response with Sale results
   * Fetch data of each property in the settings criterias and transform to ImhProp interface
   * Call to setLastSearchSaleImhTransformed method
   * @param {*} response - The response of the request
   * @param {*} category - Category of search
   */
  async function onGetSearchPageStateResponseSale(response, category) {
    const maxHomePrice = localStorage.getItem(IMH_MAX_HOME_PRICE_TO_COMPARISON);
    const propsRes = response[category]?.searchResults?.mapResults || response?.cat1?.searchResults?.mapResults;

    // item to fetch data
    let index = 0;
    const filteredPropsToFetchDetails = propsRes.filter(prop => prop.hdpData && !propertiesDetailsHash[prop.zpid] && !(prop.hdpData.homeInfo.price > maxHomePrice))
    const itemsDataReqList = filteredPropsToFetchDetails.map(async (prop) => {
      await delay(350 * index, 'delay');
      index++;
      try {
        return await fetchItemData(prop.zpid);
      } catch (ex) {
        console.error(ex);
        return null;
      }
    });
    const itemsDataList = await Promise.all(itemsDataReqList);

    if (itemsDataList) {
      itemsDataList.forEach(prop => {
        if (prop) {
          propertiesDetailsHash[prop.data.property.zpid] = prop;
        }
      });
    }

    lastSearchPropResultHash.sale = propsRes.map(prop => {
      const imhProp = transformToImhProp(propertiesDetailsHash[prop.zpid], prop, SEARCH_TYPE.SALE);
      cachedImhPropsData.sale[prop.zpid] = imhProp;
      return imhProp;
    });
    services.compsViews.setLastSearchSaleImhTransformed(lastSearchPropResultHash.sale);
  }

  /**
   * Interceptor of onGetSearchPageState Response with Sold results
   * Transform to ImhProp interface
   * Call to setLastSearchSoldImhTransformed method
   * @param {*} response - The response of the request
   * @param {*} category - Category of search
   */
  async function onGetSearchPageStateResponseSold(response, category) {
    const propsRes = response[category]?.searchResults?.mapResults || response?.cat1?.searchResults?.mapResults;
    if (propsRes) {
      lastSearchPropResultHash.sold = propsRes.map(prop => {
        const imhProp = transformToImhProp(null, prop, SEARCH_TYPE.SOLD);
        cachedImhPropsData.sold[prop.zpid] = imhProp;
        return imhProp;
      });

      services.compsViews.setLastSearchSoldImhTransformed(lastSearchPropResultHash.sold);
    }
  }

  /**
   * Extract the url of the request from the args
   * @param {*} args - arguments of the fetch request
   * @returns - url of the request
   */
  function extractUrlOfGetSearchPageStateRequest(args) {
    const url = args[0].split('?')[0];
    return url;
  }

  /**
   * Extract the request query params from the args
   * @param {*} args - arguments of the fetch request
   * @returns - query params of the request
   */
  function extractPramsOfGetSearchPageStateRequest(args) {
    let params = null;
    const paramsEncoded = args[0].split('?')[1];

    if (paramsEncoded) {
      const decodedParams = decodeURIComponent(decodeURIComponent(paramsEncoded));
      params = new URLSearchParams(decodedParams);
    }
    return params;
  }

  /**
   * Extract the keywords of search from query params from the args
   * @param {*} args - arguments of the fetch request
   * @returns - keywords of search from the request
   */
  function extractKeywordsSearchFromRequest(args) {
    let s = decodeURI(args[0]).split('?')[1];
    let result = {};
    s.split('&').forEach(function (pair) {
      pair = pair.split('=');
      result[pair[0]] = decodeURIComponent(pair[1] || '');

    });
    return JSON.parse(result.searchQueryState)?.filterState?.keywords?.value;
  }

  /**
   * Detect and return search type of the request to GetSearchPageState from the filterState query param of GetSearchPageState
   * @param {*} filterState - Zillow filterState query param from search GetSearchPageState request
   * @returns - search type of the request
   */
  function detectSearchType(filterState) {
    let searchType = SEARCH_TYPE.SALE;
    if (filterState.isForRent) {
      searchType = SEARCH_TYPE.RENT;
    }
    if (filterState.isRecentlySold) {
      searchType = SEARCH_TYPE.SOLD;
    }
    return searchType;
  }

  /**
   * Update params to sold search based on sell search (update the object by ref)
   * @param {*} filterState - query param of filterState from sell search 
   */
  function updateParamsToSearchSoldRequestBaseSellSearch(filterState) {
    filterState.doz = {
      value: '6m'
    };
    filterState.isRecentlySold = {
      value: true
    };
    filterState?.price ? delete filterState.price['max'] : null;
    filterState.isForSaleByAgent = { value: false };
    filterState.isForSaleByOwner = { value: false };
    filterState.isNewConstruction = { value: false };
    filterState.isComingSoon = { value: false };
    filterState.isAuction = { value: false };
    filterState.isForSaleForeclosure = { value: false };
  }

  /**
   * Observe to loading ending and call to getUICardItem each prop card to append UI
   */
  function updateUIItems() {
    const zillowLoaderElm = $('.list-loading-message-cover');

    if (zillowLoaderElm.length) {
      // when loader is removed it detect the ui changes done
      zillowLoaderElm.on('DOMNodeRemoved', (ev) => {
        const itemsOnUI = $('.list-card');
        for (const itemOnUI of itemsOnUI) {
          updateUIItem(itemOnUI);
        }
      });
    } else {
      const itemsOnUI = $('.list-card');
      if (itemsOnUI.length) {
        for (const itemOnUI of itemsOnUI) {
          updateUIItem(itemOnUI);
        }
      }
      else {
        const itemsOnUI = $('.property-card');
        for (const itemOnUI of itemsOnUI) {
          updateUIItem(itemOnUI, $(itemOnUI.children[0]));
        }

        const itemsToLoad = $("[data-renderstrat=on-visible], [class^=ListItem-]");
        itemsToLoad.on('DOMSubtreeModified', (ev) => {
          const itemOnUI = $(ev.target).find('.property-card');
          if (itemOnUI.length) {
            updateUIItem(itemOnUI[0], $(itemOnUI[0].children[0]));
          }
        });
      }
    }
  }

  function updateUIItem(itemOnUI, container) {

    const observeItemChanges = (itemId, itemElm) => {
      var observer = new MutationObserver((mutations) => {
        observer.disconnect();
        const newItemUI = $(`#${itemId}`);
        if (newItemUI.length > 0) {
          const itemId = newItemUI[0].id;
          const propertyId = itemId.split('_')[1];
          $(newItemUI).find('.imh-card-data-container').remove();
          const imhElm = services.compsViews.getUICardItem(propertyId, onAddToExcelBtnClicked);
          container ? container.append(imhElm.container) : $(itemOnUI).append(imhElm.container);
          observeItemChanges(itemId, $(itemOnUI));
        }
      });
      observer.observe(itemElm[0].parentElement, { childList: true });
    }

    const itemId = itemOnUI.id;
    const propertyId = itemId.split('_')[1];
    $(itemOnUI).find('.imh-card-data-container').remove();
    const imhElm = services.compsViews.getUICardItem(propertyId, onAddToExcelBtnClicked);
    container ? container.append(imhElm.container) : $(itemOnUI).append(imhElm.container);
    observeItemChanges(itemId, $(itemOnUI));
  }

  async function onAddToExcelBtnClicked(item) {
    const googleSheetName = services.settingFrom.getGoogleSheetName();
    let storeData = item.imhData;
    if (!item.isPropDataFetched) { 
      const itemData = await fetchItemData(item.searchData.zpid);
      const imhProp = transformToImhProp(itemData, item.searchData, SEARCH_TYPE.SALE);
      storeData = imhProp.imhData;
    }
    const resContent = await services.googleSheetService.storeDataToGoogleSheet([storeData], googleSheetName);
  }
  /**
   * Create delay
   * @param {*} delay - delay time in milliseconds
   * @param {*} message - message log after delay end
   * @returns - return promise after delay end
   */
  function delay(delay, message) {
    return new Promise((resolve) => setTimeout(() => {
      console.log(message);
      resolve();
    }, delay))
  }

  /**
   * Create fetch get request
   * @param {*} urlReq - URL of the request
   * @param {*} imhExtraData - IMH extra data of the request
   * @returns - Response of the request
   */
  async function callGet(urlReq, imhExtraData = {}) {
    const res = await fetch(urlReq, {
      imhExtraData: {
        ...imhExtraData
      }
    });
    const resContent = await res.json();
    // console.log(resContent)
    return resContent;
  }

  /**
   * Transform data to Imh object interface that contains imhData object nested
   * @param {*} propertyData - Data of property return by the fetch data
   * @param {*} searchData - Data of property return from the main search
   * @returns - Imh object interface that contains imhData object nested
   */
  function transformToImhProp(propertyData, searchData, searchType) {
    try {
      const imhProp = {
        imhData: {
          ID: searchData?.hdpData?.homeInfo?.zpid,
          imgSrc: searchData?.imgSrc,
          agentName: propertyData?.data?.property?.attributionInfo.agentName,
          agentPhoneNumber: propertyData?.data?.property?.attributionInfo.agentPhoneNumber,
          agentEmail: propertyData?.data?.property?.attributionInfo.agentEmail,
          brokerName: propertyData?.data?.property?.attributionInfo.brokerName,
          brokerPhoneNumber: propertyData?.data?.property?.attributionInfo.brokerPhoneNumber,
          timeInPlatform: propertyData?.data?.property?.timeOnZillow,
          Role: searchData?.hdpData?.homeInfo?.listing_sub_type?.is_FSBO ? 'FSBO' : propertyData?.data?.property?.listing_sub_type.is_FSBA ? 'FSBA' : '',
          Link: `https://www.zillow.com/${searchData.detailUrl}`,
          Address: `${propertyData?.data?.property?.address?.streetAddress}, ${propertyData?.data?.property?.address?.city}, ${propertyData?.data?.property?.address?.state}, ${propertyData?.data?.property?.address?.zipcode}`,
          Year: propertyData?.data?.property?.yearBuilt,
          Type: searchData?.hdpData?.homeInfo?.homeType,
          Comments: propertyData?.data?.property?.description,
          Beds: searchData?.hdpData?.homeInfo?.bedrooms,
          Bathes: searchData?.hdpData?.homeInfo?.bathrooms,
          Sqf: searchData?.hdpData?.homeInfo?.livingArea,
          Cost: searchData?.hdpData?.homeInfo?.price,
          DaysInPlatform: propertyData?.data?.property?.daysOnZillow,
          Saved: propertyData?.data?.property?.favoriteCount,
          Views: propertyData?.data?.property?.pageViewCount,
          PriceHistory: propertyData?.data?.property?.priceHistory?.map(hp => `${hp.event} - date: ${hp.date}: price: ${hp.price}`).join('\n'),
          RepairCost: 0,
          ARV: 0,
          OtherDetails: '',
          LotSize: propertyData?.data?.property?.lotSize,
          latitude: searchData?.hdpData?.homeInfo?.latitude,
          longitude: searchData?.hdpData?.homeInfo?.longitude,
          // OnSale: 
          rentEstimate: propertyData?.data?.property?.rentZestimate || searchData?.hdpData?.homeInfo?.rentZestimate,
          keywordsSearch: MOTIVATION_KEYWORDS.filter(keyword => propertyData?.data?.property?.description?.indexOf(keyword) > -1).join(', '),
          source: 'Zillow'
        },
        searchData,
        propertyData,
        searchType,
        isPropDataFetched: !!propertyData
      };
      imhProp.recomendationPrice = services.compsViews.getRecommendationPriceBeforeRehab(imhProp.imhData);

      return imhProp;
    } catch (ex) {
      console.error(ex);
    }
  }

  /**
   * Fetch data of the property from Zillow by zpid
   * @param {*} zpid - The zpid of the property
   * @returns - Data was fetch from Zillow
   */
  async function fetchItemData(zpid) {
    const url = 'https://www.zillow.com/graphql/';
    const data = {
      operationName: "ForSaleShopperPlatformFullRenderQuery",
      variables: {
        zpid,
        contactFormRenderParameter: {
          zpid,
          platform: "desktop",
          isDoubleScroll: true
        }
      },
      queryId: "2cd29f56269a295520cce6203b1478c9"
    };

    const response = await fetch(url, {
      method: 'POST', // *GET, POST, PUT, DELETE, etc.
      mode: 'cors', // no-cors, *cors, same-origin
      cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
      credentials: 'same-origin', // include, *same-origin, omit
      headers: {
        'Content-Type': 'application/json'
        // 'Content-Type': 'application/x-www-form-urlencoded',
      },
      redirect: 'follow', // manual, *follow, error
      referrerPolicy: 'no-referrer', // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
      body: JSON.stringify(data) // body data type must match "Content-Type" header
    });
    return response.json(); // parses 
  }

  $(document).ready(() => {
    init();
  })
})(jQuery);
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
        REDFIN_MAX_RESULTS: 350
    }


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
        hookPageChanged();
    }

    function hookPageChanged() {
        let pathname = location.pathname;
        setTimeout(() => {
            updateUIItems();
        }, 15000);
        window.addEventListener("click", function () {
            // setTimeout(() => {
            //     if (location.pathname != pathname) {
            //         pathname = location.pathname;
            //         updateUIItems();
            //     }
            // }, 1000);
        });
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
        var open_original = XMLHttpRequest.prototype.open;
        var send_original = XMLHttpRequest.prototype.send;
    
        XMLHttpRequest.prototype.open = function (method, url, async, unk1, unk2) {
          open_original.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function (data) {
          const onreadystatechange_original = this.onreadystatechange;
    
          this.onreadystatechange = function () {
            if (this.readyState === XMLHttpRequest.DONE) {
              if (onreadystatechange_original) {
                onreadystatechange_original.apply(this);  
              }
              interceptorResponse(data, this);
            }
            console.log(this);
          }
    
          send_original.apply(this, arguments); // reset/reapply original send method
        }
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
        if (response.responseURL.indexOf('www.redfin.com/stingray/api/gis?') == -1) {
            const data = response.response.split('{}&&')[1];
            if (data) {
                onGetSearchPageStateResponse(args, response);
            }
        }

        return resInterceptor;
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
        const keywordsSearch = extractKeywordsSearchFromRequest(response.responseURL);
        const resData = response.response.split('{}&&')[1];
        if (resData) {
            const res = JSON.parse(resData);

            let searchType = SEARCH_TYPE.SALE;
            const homes = res?.payload?.homes || res?.payload?.originalHomes?.homes;
            if (response.responseURL.indexOf('min_price') < 0) {
                services.notificationService.notify(`Please select minimum price`, NOTIFICATION_TYPES.INFO);
                return;
            }
            if (homes?.length >= SITE_CONFIG.REDFIN_MAX_RESULTS) {
                services.notificationService.notify(`There are too much results, please zoomin`, NOTIFICATION_TYPES.ERROR);
            }

            searchType = detectSearchType(response.responseURL);
            console.log(searchType);
            switch (searchType) {
                case SEARCH_TYPE.SALE: {
                    await onGetSearchPageStateResponseSale(res, response.responseURL);
                    break;
                }
                case SEARCH_TYPE.SOLD: {
                    onGetSearchPageStateResponseSold(res);
                    break;
                }
            }
            updateUIItems();

            // if (args[1]?.imhExtraData?.makePreviouslyCall && args[1]?.imhExtraData?.previoslyReq) {
            //     return () => callGet(args[1].imhExtraData.previoslyReq, {
            //         skipInterceptorRequest: true,
            //         skipInterceptorResponse: args[0]
            //     });
            // }
        }
    }

    /**
     * Interceptor of onGetSearchPageState Response with Sale results
     * Fetch data of each property in the settings criterias and transform to ImhProp interface
     * Call to setLastSearchSaleImhTransformed method
     * @param {*} response - The response of the request
     * @param {*} category - Category of search
     */
    async function onGetSearchPageStateResponseSale(res, responseURL) {
        const maxHomePrice = localStorage.getItem(IMH_MAX_HOME_PRICE_TO_COMPARISON);
        const propsRes =  res?.payload?.homes || res?.payload?.originalHomes?.homes;
        console.log(propsRes);
        // item to fetch data
        let index = 0;
        const filteredPropsToFetchDetails = propsRes.filter(prop => !propertiesDetailsHash[prop.propertyId] && !(prop.price.value > maxHomePrice));

        const itemsDataReqList = filteredPropsToFetchDetails.map(async (prop) => {
            await delay(350 * index, 'delay');
            index++;
            try {
                return await fetchItemData(prop.propertyId, prop.listingId);
            } catch (ex) {
                console.error(ex);
                return null;
            }
        });
        const itemsDataList = await Promise.all(itemsDataReqList);

        if (itemsDataList) {
            itemsDataList.forEach(prop => {
                if (prop) {
                    propertiesDetailsHash[prop.propertyId] = prop;
                }
            });
        }

        lastSearchPropResultHash.sale = propsRes.map(prop => {
            const imhProp = transformToImhProp(propertiesDetailsHash[prop.propertyId], prop, SEARCH_TYPE.SALE);
            cachedImhPropsData.sale[prop.propertyId] = imhProp;
            return imhProp;
        });
        services.compsViews.setLastSearchSaleImhTransformed(lastSearchPropResultHash.sale, onHoverCompsRow);

        const url = extractUrlOfGetSearchPageStateRequest(responseURL);
        const queryParams = extractPramsOfGetSearchPageStateRequest(responseURL);
        queryParams.delete('sf');
        queryParams.append('sold_within_days', '180');
        callGet(`${url}?${queryParams}`);
        // console.log('requestParams: ', requestParams);
    }

    /**
     * Interceptor of onGetSearchPageState Response with Sold results
     * Transform to ImhProp interface
     * Call to setLastSearchSoldImhTransformed method
     * @param {*} response - The response of the request
     * @param {*} category - Category of search
     */
    async function onGetSearchPageStateResponseSold(res) {
        const propsRes = res.payload.homes;
        if (propsRes) {
            lastSearchPropResultHash.sold = propsRes.map(prop => {
                const imhProp = transformToImhProp(null, prop, SEARCH_TYPE.SOLD);
                cachedImhPropsData.sold[prop.propertyId] = imhProp;
                return imhProp;
            });

            services.compsViews.setLastSearchSoldImhTransformed(lastSearchPropResultHash.sold, onHoverCompsRow);
        }
    }

    /**
     * Funcation used as a callback to pass to setLastSearchSaleImhTransformed and setLastSearchSoldImhTransformed
     * The function will called each hover a row of the table on the comarisation window
     * @param {*} isMouseIn - true if the mouse goes in, false if mouse goes out
     * @param {*} property - the object of imhProperty
     */
    function onHoverCompsRow(isMouseIn, property) {
        let allMarkers = $('.PushpinContent');
        allMarkers.parent().css('z-index', 100);
        allMarkers.removeClass('selected');
        allMarkers.find('.inner-pushpin-content').removeClass('selected');
        allMarkers.find('.price').removeClass('selected');
            
        if (isMouseIn) {
            let relevantMarker = $(`[data-rf-test-id="home-marker-${property.imhData.ID}"]`);
            relevantMarker.parent().css('z-index', 106);
            relevantMarker.addClass('selected');
            relevantMarker.removeClass('viewed');
            relevantMarker.find('.inner-pushpin-content').addClass('selected');
            relevantMarker.find('.inner-pushpin-content').removeClass('viewed');
            relevantMarker.find('.price').addClass('selected');
            relevantMarker.find('.price').removeClass('viewed');
        }
    }



    function extractUrlOfGetSearchPageStateRequest(responseURL) {
        const url = responseURL.split('?')[0];
        return url;
    }

    function extractPramsOfGetSearchPageStateRequest(responseURL) {
        let params = null;
        const paramsString = responseURL.split('?')[1];
        if (paramsString) {
            params = new URLSearchParams(paramsString);
        }
        return params;
    }

    function detectSearchType(responseURL) {
        let searchType = 'Sale';
        // if (responseURL.split('?')[1].indexOf('sold_within_days') > -1) {
        //     searchType = 'Rent';
        // }
        if (responseURL.split('?')[1].indexOf('sold_within_days') > -1) {
            searchType = 'Sold';
        }
        return searchType;
    }

    function extractKeywordsSearchFromRequest(url) {
        let s = decodeURI(url).split('?')[1];
        let result = {};
        s.split('&').forEach(function (pair) {
            pair = pair.split('=');
            result[pair[0]] = decodeURIComponent(pair[1] || '');

        });
        return result?.ft;
    }

    function updateUIItems() {
        const itemsOnUI = $('.HomeCard');
        for (let itemOnUI of itemsOnUI) {
            updateUIItem(itemOnUI);
        }
    }

    function updateUIItem(itemOnUI) {
        const aTag = $(itemOnUI).find('a');
        const href = aTag[0]?.href;
        if (href) {
            let hrefsplitted = href.split('/');
            if (hrefsplitted.length > 0) {
                const propertyId = hrefsplitted[hrefsplitted.length - 1];

                const itemElm = $(itemOnUI);
                const redfinInteractiveElm = itemElm.find('.interactive');

                itemElm.addClass('him-auto-height');
                $(redfinInteractiveElm).find('.imh-card-data-container').remove();
                const imhElm = services.compsViews.getUICardItem(propertyId, onAddToExcelBtnClicked);
                redfinInteractiveElm.append(imhElm);
                var observer = new MutationObserver((mutations) => {
                    observer.disconnect();
                    updateUIItem(item);
                });
                observer.observe(itemElm[0].parentElement, { childList: true });
            }
        }
    }

    async function onAddToExcelBtnClicked(item) {
        const googleSheetName = services.settingFrom.getGoogleSheetName();
        let storeData = item.imhData;
        if (!item.isPropDataFetched) { 
          const itemData = await fetchItemData(item.searchData.propertyId, item.searchData.listingId);
          const imhProp = transformToImhProp(itemData, item.searchData, SEARCH_TYPE.SALE);
          storeData = imhProp.imhData;
        }
        const resContent = await services.googleSheetService.storeDataToGoogleSheet([storeData], googleSheetName);
      }

    async function fetchItemData(propertyId, listingId) {
        try {
            const aboveTheFoldUrl = `https://www.redfin.com/stingray/api/home/details/aboveTheFold?propertyId=${propertyId}&accessLevel=1`
            const belowTheFoldUrl = `https://www.redfin.com/stingray/api/home/details/belowTheFold?propertyId=${propertyId}&accessLevel=1&listingId=${listingId}&pageType=1`;
            const onMarketUrl = `https://www.redfin.com/stingray/api/home/details/customerConversionInfo/onMarket?propertyId=${propertyId}&accessLevel=1&listingId=${listingId}&pageType=1`;

            const mapApisKeys = new Map([
                [aboveTheFoldUrl, 'aboveTheFold'],
                [belowTheFoldUrl, 'belowTheFold'],
                [onMarketUrl, 'onMarket']
            ]);

            const aboveTheFoldResponse = fetch(aboveTheFoldUrl);
            const belowTheFoldResponse = fetch(belowTheFoldUrl);
            const onMarketResponse = fetch(onMarketUrl);
            const responseApis = await Promise.all([aboveTheFoldResponse, belowTheFoldResponse, onMarketResponse]);

            const res = {
                propertyId,
                listingId
            };
            for (const apiRes of responseApis) {
                const key = mapApisKeys.get(apiRes.url);
                const responseText = await apiRes.text(); // parses 
                const resSplited = responseText.split('{}&&')[1];
                if (resSplited) {
                    res[key] = JSON.parse(resSplited);
                }
            }
            return res;
        } catch (ex) {
            console.error(ex);
            return {};
        }
    }

    function dateDiffInDays(a, b) {
        const _MS_PER_DAY = 1000 * 60 * 60 * 24;
        // Discard the time and time-zone information.
        const utc1 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
        const utc2 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());

        return Math.floor((utc2 - utc1) / _MS_PER_DAY);
    }

    function formatDate(date) {
        let d = new Date(date),
            month = '' + (d.getMonth() + 1),
            day = '' + d.getDate(),
            year = d.getFullYear();

        if (month.length < 2)
            month = '0' + month;
        if (day.length < 2)
            day = '0' + day;

        return [year, month, day].join('-');
    }

    /**
     * Create fetch get request
     * @param {*} urlReq - URL of the request
     * @param {*} imhExtraData - IMH extra data of the request
     * @returns - Response of the request
     */
    async function callGet(urlReq, imhExtraData = {}) {
        const req = new XMLHttpRequest();
        req.open("GET", urlReq);
        req.send();
    }

    function transformToImhProp(propertyData, searchData, searchType) {
        const imhProp = {
            imhData: {
                ID: searchData?.propertyId,
                imgSrc: `https://ssl.cdn-redfin.com/photo/${searchData?.dataSourceId}/islphoto/${searchData?.mlsId?.value?.slice(-3)}/genIslnoResize.${searchData?.mlsId?.value}_0.jpg`,
                agentName: propertyData?.onMarket?.payload?.mlsDisclaimerInfo?.listingAgentName || propertyData?.belowTheFold?.payload?.amenitiesInfo?.mlsDisclaimerInfo?.listingAgentName,
                agentPhoneNumber: propertyData?.onMarket?.payload?.mlsDisclaimerInfo?.listingAgentNumber || propertyData?.belowTheFold?.payload?.amenitiesInfo?.mlsDisclaimerInfo?.listingAgentNumber,
                agentEmail: 'TODO',
                brokerName: propertyData?.onMarket?.payload?.mlsDisclaimerInfo?.listingBrokerName,
                brokerPhoneNumber: propertyData?.onMarket?.payload?.mlsDisclaimerInfo?.listingBrokerNumber,
                timeInPlatform: 'TODO',
                Role: 'TODO',
                Link: `https://www.redfin.com${searchData?.url}`,
                Address: `${searchData?.streetLine.value}, ${searchData?.city}, ${searchData?.state}, ${searchData?.zip}`,
                Year: searchData?.yearBuilt?.value,
                Type: propertyData?.belowTheFold?.payload?.publicRecordsInfo?.basicInfo?.propertyTypeName,
                Comments: searchData?.listingRemarks,
                Beds: searchData?.beds,
                Bathes: searchData?.baths,
                Sqf: searchData?.sqFt?.value,
                Cost: searchData?.price?.value,
                DaysInPlatform: dateDiffInDays(new Date(Date.now() - searchData?.timeOnRedfin?.value), new Date(Date.now())),
                Saved: 'TODO',
                Views: 'TODO',
                PriceHistory: propertyData?.belowTheFold?.payload?.propertyHistoryInfo?.events.map(hp => `${hp?.eventDescription} - date: ${formatDate(hp?.eventDate)}: price: ${hp?.price ? hp?.price : '--'}`).join('\n'),
                RepairCost: 0,
                ARV: 0,
                OtherDetails: '',
                LotSize: searchData?.lotSize?.value,
                latitude: searchData?.latLong?.value?.latitude,
                longitude: searchData?.latLong?.value?.longitude,
                rentEstimate: 'TODO',
                keywordsSearch: MOTIVATION_KEYWORDS.filter(keyword => searchData?.listingRemarks?.indexOf(keyword) > -1).join(', '),
                source: 'Redfin',
                MlsID: searchData?.mlsId?.value,
                // OnSale: 
            },
            searchData,
            propertyData,
            searchType,
            isPropDataFetched: !!propertyData
        }
        imhProp.recomendationPrice = services.compsViews.getRecommendationPriceBeforeRehab(imhProp.imhData);

        return imhProp;
    }

    function delay(delay, message) {
        return new Promise((resolve) => setTimeout(function () {
            console.log(message);
            resolve();
        }, delay))
    }

    $(document).ready(() => {
        init();
    })
})(jQuery);

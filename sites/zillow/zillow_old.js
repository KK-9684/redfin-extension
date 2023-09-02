// UPDATE_HOVERED_MARKER_ID
// UPDATE_MAP_MARKER_LAT_LON

import {
    IMH_KM_DISTANCE_TO_COMPARISON,
    IMH_PRECENTAGE_UNDER_AVG_TO_COMPARISON,
    IMH_MAX_HOME_PRICE_TO_COMPARISON,
    IMH_PRECENTAGE_PRICE_TO_SQF_AVG_TO_COMPARISON,
    IMH_MINIMUM_PROPERTIES_TO_COMPS
} from '../consts/localStorage.consts.js';
import { MOTIVATION_KEYWORDS } from '../consts/motivationKeywords.consts.js';
import { NotificationService, NOTIFICATION_TYPES } from '../services/notification/notification.service.js';
import { FloatingMenu } from '../services/floatingMenu/floatingMenu.js';
import { SettingFrom } from '../services/settingsForm/settingsForm.js';
import { GoogleSheetService } from '../services/googleSheet/googleSheet.service.js';
import { CompsViews } from '../services/compsViews/compsViews.js';

(function ($) {
    const SITE_CONFIG = {
        ZILLOW_MAX_RESULTS: 500
    };

    const ELEMENT_IDS = {
        divPotentialPricePropertiesContent: 'divPotentialPricePropertiesContent',
        divPotentialSqfAvgPricePropertiesContent: 'divPotentialSqfAvgPricePropertiesContent',
        divPropertiesTimeOnMarket: 'divPropertiesTimeOnMarket',
    }

    const services = {
        floatingMenu: null,
        settingFrom: null,
        notificationService: null,
        googleSheetService: null
    };

    const dataToCalculate = {
        countOfMonth: 12,
        percentageAfterExpenses: 0.6,
        desiredProfitPercentage: 0.09,
        entrepreneurFee: 5000
    };

    const IMHstate = {
        requestsResList: new Map(),
        itemsFound: new Map(),
        currentMapSaleProperties: null,
        currentMapSoldProperties: null,
        potentialProperties: {
            saleToSalePrice: {},
            saleToSoldPrice: {},
            saleTosaleSqfPrice: {},
            saleToSoldSqfPrice: {}
        },
        propertiesDetails: {},
        transformedProperties: {}
    };

    function init() {
        services.notificationService = new NotificationService();
        services.floatingMenu = new FloatingMenu($('body'));
        services.settingFrom = new SettingFrom(services.notificationService, services.floatingMenu);
        services.googleSheetService = new GoogleSheetService(services.notificationService);
        overrideGlobalFetch();

        services.floatingMenu.addItemToFloatingMenu('imh--upload-properties-button', `<svg style="width:24px;height:24px" viewBox="0 0 24 24">
            <path fill="currentColor" d="M9,14V8H5L12,1L19,8H15V14H9M5,18V16H19V18H5M19,20H5V22H19V20Z" />
        </svg>`, onUploadPropertiesClicked, 'imh--upload-properties-button');

        services.compsViews = new CompsViews(services.settingFrom, services.floatingMenu);
        // listenPropertyCardAdded();
    }
    
    async function onUploadPropertiesClicked() {
        try {
            services.floatingMenu.updateButtonLoading('imh--upload-properties-button', true);
            const googleSheetName = services.settingFrom.getAutomationGoogleSheetName();
            let list = [];
            Object.keys(IMHstate.propertiesDetails).forEach(key => {
                list.push(transformSheetData(IMHstate.propertiesDetails[key].data, ''));
            })
            await services.googleSheetService.storeDataToGoogleSheet(list, googleSheetName);
        } catch (ex) {
            console.error(ex);
        }
        services.floatingMenu.updateButtonLoading('imh--upload-properties-button', false);
    }
    

    /*************************************************/
    /******* Create Proxy of fetch method ************/
    /*************************************************/
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
                    if(resInterceptorRes.callAfter) {
                        await resInterceptorRes.callAfter();
                    }

                }).catch((error) => {
                    reject(error);
                });
            });
        }
    }

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

    function onGetSearchPageStateRequest(args) {
        let searchType = 'Sale';
        let url = extractUrlOfGetSearchPageStateRequest(args);
        let params = extractPramsOfGetSearchPageStateRequest(args);
        if (params) {
            let buildNewQuery = '';
            for (let param of params) {
                const key = param[0];
                const val = JSON.parse(param[1]);
                if (key === 'searchQueryState') {
                    const filterState = val.filterState;
                    searchType = detectSearchType(filterState);

                    if (searchType === 'Sale') {
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
                }
                const valQuery = encodeURIComponent(JSON.stringify(val));
                buildNewQuery += buildNewQuery ? `&${key}=${valQuery}` : `${key}=${valQuery}`;
            }
            if (searchType === 'Sale') {
                IMHstate.currentMapSoldProperties = null;
                let reqUrl = `${url}?${buildNewQuery}`;
                return () => callGet(reqUrl, {
                    makePreviouslyCall: true,
                    previoslyReq: args[0]
                });
            }
        }
    }

    async function onGetSearchPageStateResponse(args, response) {
        const maxHomePrice = localStorage.getItem(IMH_MAX_HOME_PRICE_TO_COMPARISON);
        const keywordsSearch = getKeywordsSearch(args);
        const res = response

        let searchType = 'Sale';
        let url = extractUrlOfGetSearchPageStateRequest(args);
        let params = extractPramsOfGetSearchPageStateRequest(args);
        if (params) {
            for (let param of params) {
                const val = JSON.parse(param[1]);
                const category = val?.category || 'cat1';
                const key = param[0];
                if (key === 'searchQueryState') {
                    if (res[category]?.searchList?.totalResultCount > SITE_CONFIG.ZILLOW_MAX_RESULTS) {
                        services.notificationService.notify(`There are too much results, please zoomin`, NOTIFICATION_TYPES.ERROR);
                    }

                    const filterState = val.filterState;
                    searchType = detectSearchType(filterState);
                    const keyValPairSale = {};
                    const keyValPairSqfSale = {};
                    switch (searchType) {
                        case 'Sale': {
                            IMHstate.currentMapSaleProperties = res[category]?.searchResults?.mapResults || res?.cat1?.searchResults?.mapResults;
                            
                            // item to fetch data
                            let index = 0;
                            const itemsDataReqList = IMHstate.currentMapSaleProperties.map(async (prop) => {
                                if (prop.hdpData) {
                                    if (IMHstate.propertiesDetails[prop.zpid] || prop.hdpData.homeInfo.price > maxHomePrice) {
                                        return null;
                                    }
                                    await delay(350 * index, 'delay');
                                    index++;
                                    try {
                                        return await fetchItemData(prop.zpid);
                                    } catch(ex) {
                                        console.error(ex);
                                        return null;
                                    }
                                }
                            });
                            const itemsDataList = await Promise.all(itemsDataReqList);
                            if (itemsDataList) {
                                itemsDataList.forEach(prop => {
                                    if (prop) {
                                        IMHstate.propertiesDetails[prop.data.property.zpid] = prop;
                                    }
                                });
                            }
                            console.log('itemsDataList', itemsDataList);

                            if (IMHstate.currentMapSaleProperties) {
                                // calculate distance between sales properties
                                const potentialProperties = getPotentialPropertiesAndSetCompData(IMHstate.currentMapSaleProperties, IMHstate.currentMapSaleProperties);
                                // console.log('potentialProperties Sale: ', potentialProperties);
                                potentialProperties[0].forEach(element => {
                                    keyValPairSale[element.zpid] = element;
                                });
                                IMHstate.potentialProperties.saleToSalePrice = {
                                    ...IMHstate.potentialProperties.saleToSalePrice,
                                    ...keyValPairSale
                                }
                                potentialProperties[1].forEach(element => {
                                    keyValPairSqfSale[element.zpid] = element;
                                });
                                IMHstate.potentialProperties.saleTosaleSqfPrice = {
                                    ...IMHstate.potentialProperties.saleTosaleSqfPrice,
                                    ...keyValPairSqfSale
                                }
                                services.compsViews.addPotentialPropertiesToView(ELEMENT_IDS.divPotentialPricePropertiesContent, potentialProperties[0], 'Sale-to-Sale',  'IMHaveragePrice', 'IMHavgPriceComp',
                                    (property) => property.price,
                                );
                                services.compsViews.addPotentialPropertiesToView(ELEMENT_IDS.divPotentialSqfAvgPricePropertiesContent, potentialProperties[1], 'Sale-to-Sale', 'IMHaverageSqfPrice', 'IMHavgSqfPriceComp',
                                    (property) => `$${(property.hdpData.homeInfo.price / property.hdpData.homeInfo.livingArea).toFixed(2).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`,
                                );
                                addPropertiesTimeOnMarketToView(IMHstate.currentMapSaleProperties);
                            }
                            break;
                        }
                        case 'Sold': {
                            IMHstate.currentMapSoldProperties =  res[category]?.searchResults?.mapResults || res?.cat1?.searchResults?.mapResults;
                            if (IMHstate.currentMapSoldProperties && IMHstate.currentMapSaleProperties) {
                                const potentialProperties = getPotentialPropertiesAndSetCompData(IMHstate.currentMapSaleProperties, IMHstate.currentMapSoldProperties);
                                potentialProperties[0].forEach(element => {
                                    keyValPairSale[element.zpid] = element;
                                });
                                IMHstate.potentialProperties.saleToSoldPrice = {
                                    ...IMHstate.potentialProperties.saleToSoldPrice,
                                    ...keyValPairSale
                                }
                                potentialProperties[0].forEach(element => {
                                    keyValPairSqfSale[element.zpid] = element;
                                });
                                IMHstate.potentialProperties.saleToSoldSqfPrice = {
                                    ...IMHstate.potentialProperties.saleToSoldSqfPrice,
                                    ...keyValPairSqfSale
                                }
                                // console.log('potentialProperties Sold: ', potentialProperties);
                                services.compsViews.addPotentialPropertiesToView(ELEMENT_IDS.divPotentialPricePropertiesContent, potentialProperties[0], 'Sale-to-Sold', 'IMHaveragePrice', 'IMHavgPriceComp',
                                    (property) => property.price,
                                );
                                
                                services.compsViews.addPotentialPropertiesToView(ELEMENT_IDS.divPotentialSqfAvgPricePropertiesContent, potentialProperties[1], 'Sale-to-Sold', 'IMHaverageSqfPrice', 'IMHavgSqfPriceComp',
                                (property) => `$${(property.hdpData.homeInfo.price / property.hdpData.homeInfo.livingArea).toFixed(2).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`,
                                );
                            }
                            break;
                        }
                    }
                }
            }
        }
        extractDataPlatform(args[0], keywordsSearch, res);

        if (args[1]?.imhExtraData?.makePreviouslyCall && args[1]?.imhExtraData?.previoslyReq) {
            return () => callGet(args[1].imhExtraData.previoslyReq, {
                skipInterceptorRequest: true,
                skipInterceptorResponse: args[0]
            });
        }
    }

    function detectSearchType(filterState) {
        let searchType = 'Sale';
        if (filterState.isForRent) {
            searchType = 'Rent';
        }
        if (filterState.isRecentlySold) {
            searchType = 'Sold';
        }
        return searchType;
    }
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

    function getPotentialPropertiesAndSetCompData(list1, list2) {
        const maxDistance = localStorage.getItem(IMH_KM_DISTANCE_TO_COMPARISON);
        const precUnderAvg = localStorage.getItem(IMH_PRECENTAGE_UNDER_AVG_TO_COMPARISON);
        const precUnderSqfAvg = localStorage.getItem(IMH_PRECENTAGE_PRICE_TO_SQF_AVG_TO_COMPARISON);
        const maxHomePrice = localStorage.getItem(IMH_MAX_HOME_PRICE_TO_COMPARISON);
        const minPropsToComps = localStorage.getItem(IMH_MINIMUM_PROPERTIES_TO_COMPS);

        const potentialAvgPrice = [];
        const potentialSqfAvgPrice = [];
        for (const propertyItem of list1) {
            const property = JSON.parse(JSON.stringify(propertyItem));
            if (property.hdpData) {
                property.IMHavgPriceComp = [];
                property.IMHavgSqfPriceComp = [];
                for (const property2 of list2) {
                    if (property.zpid !== property2.zpid) {
                        if (calcCrow(property.latLong, property2.latLong) <= maxDistance) {
                            if (property2.hdpData) {
                                property.IMHavgPriceComp.push(property2);
                                property.IMHavgSqfPriceComp.push(property2);
                            } else {
                                // debugger
                            }
                        }
                    }
                }

                let limitPrice = 0;
                property.IMHaveragePrice = (property.IMHavgPriceComp.map(neighbor => neighbor.hdpData.homeInfo.price).reduce((a, b) => a + b, 0) / property.IMHavgPriceComp.length).toFixed(2);
                limitPrice = property.IMHaveragePrice * precUnderAvg;
                if (property.hdpData.homeInfo.price <= limitPrice) {
                    if (property.hdpData.homeInfo.price < maxHomePrice) {
                        if (property.IMHavgPriceComp.length >= minPropsToComps) {
                            potentialAvgPrice.push(property);
                        }
                    }
                }

                property.IMHaverageSqfPrice = (property.IMHavgSqfPriceComp.map(neighbor => neighbor.hdpData.homeInfo.price / neighbor.hdpData.homeInfo.livingArea).reduce((a, b) => a + b, 0) / property.IMHavgSqfPriceComp.length).toFixed(2);
                limitPrice = property.IMHaverageSqfPrice * precUnderSqfAvg;
                if (property.hdpData.homeInfo.price / property.hdpData.homeInfo.livingArea <= limitPrice) {
                    if (property.hdpData.homeInfo.price < maxHomePrice) {
                        if (property.IMHavgSqfPriceComp.length >= minPropsToComps) {
                            potentialSqfAvgPrice.push(property);
                        }
                    }
                }
            }
        }
        return [potentialAvgPrice, potentialSqfAvgPrice];
    }


    // calculate distance between two point of latitude and longitude
    function calcCrow(point1, point2) {
        var R = 6371; // km
        var dLat = toRad(point2.latitude - point1.latitude);
        var dLon = toRad(point2.longitude - point1.longitude);
        var lat1 = toRad(point1.latitude);
        var lat2 = toRad(point2.latitude);

        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        var d = R * c;
        return d;
    }

    // Converts numeric degrees to radians
    function toRad(Value) {
        return Value * Math.PI / 180;
    }

    function extractUrlOfGetSearchPageStateRequest(args) {
        const url = args[0].split('?')[0];
        return url;
    }

    function extractPramsOfGetSearchPageStateRequest(args) {
        let params = null;
        const paramsEncoded = args[0].split('?')[1];

        if (paramsEncoded) {
            const decodedParams = decodeURIComponent(decodeURIComponent(paramsEncoded));
            params = new URLSearchParams(decodedParams);
        }
        return params;
    }

    /*********************************************/
    /*******Extract data from response************/
    /*********************************************/
    async function extractDataPlatform(url, keywordsSearch, data) {
        const property = Object.keys(data).find(key => key.startsWith('cat'));
        const listResults = data[property]?.searchResults?.listResults;
        const rehabPerSqf = services.settingFrom.getRehubSqfPrice()
        if (listResults) {
            // console.log(listResults);
            const resMapped = listResults
                .map((item) => {
                    try {
                        // const s = await fetchItemData(item.zpid);
                        // console.log(s);
                        return {
                            // rentZestimate: item.hdpData.homeInfo.rentZestimate,
                            // livingArea: item.hdpData.homeInfo.livingArea,
                            // price: item.hdpData.homeInfo.price,
                            // priceForHDP: item.hdpData.homeInfo.priceForHDP,
                            // city: item.hdpData.homeInfo.city,
                            ...item,
                            variableData: JSON.stringify(item.variableData),
                            maxPriceSmallRehab: calculateMaxPrice(item.hdpData.homeInfo.rentZestimate, item.hdpData.homeInfo.livingArea, rehabPerSqf.small),
                            maxPriceMediumRehab: calculateMaxPrice(item.hdpData.homeInfo.rentZestimate, item.hdpData.homeInfo.livingArea, rehabPerSqf.medium),
                            maxPriceBigRehab: calculateMaxPrice(item.hdpData.homeInfo.rentZestimate, item.hdpData.homeInfo.livingArea, rehabPerSqf.big),
                        }
                    }
                    catch (ex) {
                        debugger
                    }
                })

            // console.log('resMapped: ', resMapped);

            keepRequestRes(url, keywordsSearch, resMapped);
            updateUIItems(url, keywordsSearch, resMapped);
        }
    }

    function getKeywordsSearch(args) {
        let s = decodeURI(args[0]).split('?')[1];
        let result = {};
        s.split('&').forEach(function (pair) {
            pair = pair.split('=');
            result[pair[0]] = decodeURIComponent(pair[1] || '');

        });
        return JSON.parse(result.searchQueryState)?.filterState?.keywords?.value;
    }

    async function keepRequestRes(url, keywordsSearch, data) {
        const results = { url, data, keywordsSearch };
        IMHstate.requestsResList.set(url, results);

        data.forEach(itemData => {
            IMHstate.itemsFound.set(`${itemData.zpid}`, { itemData, keywordsSearch });
        });

        // addResultsToView(results, url);
    }

    function closeElement(elementId) {
        const divWrapper = $(`#${elementId}`);
        if (divWrapper.length > 0) {
            divWrapper[0].classList.remove('is-open');
        }
    }

    function addPropertiesTimeOnMarketToView(resItems) {
        const oldSection = $(`#${ELEMENT_IDS.divPropertiesTimeOnMarket}-section`);
        if (oldSection.length) {
            oldSection.remove();
        }
        if (IMHstate.propertiesDetails) {
            const minimumTimeOnMarket = services.settingFrom.getMinimumTimeOnMarket();
            const maximumTimeOnMarket = services.settingFrom.getMaximumTimeOnMarket();
            
            const section = document.createElement('div');
            section.classList.add('potential-properties');
            section.setAttribute('id', `${ELEMENT_IDS.divPropertiesTimeOnMarket}-section`);
            const container = $(`#${ELEMENT_IDS.divPropertiesTimeOnMarket}-properties`)[0];
            container.appendChild(section);

            var table_body = '<table border="1">';
            table_body += `
                <thead>
                    <tr>
                        <th>Link</th>
                        <th>Price</th>
                        <th>Days On Market</th>
                    </tr>
                </thead>
                <tbody>
            `;

            resItems.forEach(resItem => {
                const property = IMHstate.propertiesDetails[resItem.zpid];
                if(property) {
                    if (property.data.property.daysOnZillow <= maximumTimeOnMarket && property.data.property.daysOnZillow >= minimumTimeOnMarket) {
                        table_body += '<tr>';

                        table_body += '<td>';
                        table_body += `
                            <a href="${resItem.detailUrl}" target="_blank">
                                <img src="${resItem.imgSrc}">
                                <div>${resItem.zpid}</div>
                            </a>
                        `;
                        table_body += '</td>';

                        table_body += '<td>';
                        table_body += `$${property.data.property.price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
                        table_body += '</td>';

                        table_body += '<td>';
                        table_body += `${property.data.property.daysOnZillow}`;
                        table_body += '</td>';
                        table_body += '</tr>';
                    }
                }
            })

            table_body += '</tbody></table>';
            $(section).append(table_body);
        }
    }

    function updateUIItems(url, keywordsSearch, data) {
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

    function listenPropertyCardAdded() {
        const observer = new MutationObserver(function (mutations_list) {
            mutations_list.forEach((mutation) => {
                mutation.addedNodes.forEach(function (added_node) {
                    if (added_node?.classList?.contains('property-card')) {
                        updateUIItem($(added_node), $(added_node.children[0]));
                        // console.log('#child has been added: ', added_node);
                    }
                });
            });
        });

        observer.observe(document.querySelector("body"), { subtree: true, childList: true });
    }

    function updateUIItem(itemOnUI, container) {
        const itemId = itemOnUI.id
        $(itemOnUI).addClass('imh-card');

        if (itemId) {
            const propertyId = itemId.split('_')[1];

            const itemElm = $(itemOnUI);
            const itemFound = IMHstate.itemsFound.get(propertyId);
            if (itemFound) {
                const itemData = IMHstate.itemsFound.get(propertyId).itemData;
                const keywordsSearch = IMHstate.itemsFound.get(propertyId).keywordsSearch;

                itemElm.find('.him-sale-comps').remove();
                itemElm.find('.him-sold-comps').remove();
                itemElm.find(".him-list-rehab-max-price").remove();
                itemElm.find('.him-button-add-to-xls').remove();
                itemElm.find('.imh-days-on-market').remove();
                container.css('background', '');

                const backgroundColor = [];
                // check if it one of potential properties
                if (IMHstate.potentialProperties.saleToSoldPrice[propertyId]) {
                    const property = IMHstate.potentialProperties.saleToSoldPrice[propertyId];
                    backgroundColor.push('#6ef26e');
                    const soldComps = $(`<div class="him-sold-comps">
                                            <div><b>Sold Comps</b></div>
                                            <div>
                                            ${property.IMHavgPriceComp.map(neighbor => {
                        return `
                                                    <a href="${neighbor.detailUrl}" target="_blank" onclick="window.open('${neighbor.detailUrl}', '_blank')">
                                                        $${neighbor.hdpData.homeInfo.price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                                                    </a>
                                                `
                    }).join(', ')}
                                            </div>
                                        </div>
                                        `)
                    container ? container.append(soldComps) : itemElm.append(soldComps);
                    $(itemOnUI).closest('.enEXBq.with_constellation').addClass('imh-potential');
                }

                if (IMHstate.potentialProperties.saleToSalePrice[propertyId]) {
                    const property = IMHstate.potentialProperties.saleToSalePrice[propertyId];
                    backgroundColor.push('yellow');
                    const saleComps = $(`<div class="him-sale-comps">
                                            <div><b>Sale Comps</b></div>
                                            <div>
                                            ${property.IMHavgPriceComp.map(neighbor => {
                        return `
                                                    <a href="${neighbor.detailUrl}" target="_blank" onclick="window.open('${neighbor.detailUrl}', '_blank')">
                                                        $${neighbor.hdpData.homeInfo.price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                                                    </a>
                                                `
                    }).join(', ')}
                                            </div>
                                        </div>
                                        `)

                    container ? container.append(saleComps) : itemElm.append(saleComps);
                    $(itemOnUI).closest('.enEXBq.with_constellation').addClass('imh-potential');
                }
                container.css('background', backgroundColor.length > 1 ? `linear-gradient(${backgroundColor})` : backgroundColor);

                if (IMHstate.propertiesDetails[propertyId]) {
                    const daysOnMarket = IMHstate.propertiesDetails[propertyId].data.property.daysOnZillow;
                    const daysOnMarketDiv = $(`<div class="imh-days-on-market">Days On Market: ${daysOnMarket}</div>`);
                    container ? container.append(daysOnMarketDiv) : itemElm.append(daysOnMarketDiv);
                }

                const rehabList = $(`
                    <div class="him-list-rehab-max-price">
                        <div class="him-rehab-max-price-item 
                            him-small-rehab
                            ${itemData.maxPriceSmallRehab > itemData?.hdpData?.homeInfo?.price ? 'him-rehab-max-price-item--good' : 'him-rehab-max-price-item--bad'}">
                                ${numberWithCommas(itemData.maxPriceSmallRehab.toFixed(3))}
                        </div>
                        <div class="him-rehab-max-price-item 
                            him-med-rehab
                            ${itemData.maxPriceMediumRehab > itemData?.hdpData?.homeInfo?.price ? 'him-rehab-max-price-item--good' : 'him-rehab-max-price-item--bad'}">
                                ${numberWithCommas(itemData.maxPriceMediumRehab.toFixed(3))}
                        </div>
                        <div class="him-rehab-max-price-item 
                            him-big-rehab
                            ${itemData.maxPriceBigRehab > itemData?.hdpData?.homeInfo?.price ? 'him-rehab-max-price-item--good' : 'him-rehab-max-price-item--bad'}">
                                ${numberWithCommas(itemData.maxPriceBigRehab)}
                        </div>
                    </div>`
                );

                container ? container.append(rehabList) : itemElm.append(rehabList);

                const addToExcelBtn = $(`<button class="him-button-add-to-xls">add to excel</button>`).click(async (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    const itemRes = await fetchItemData(itemData.zpid);
                    const itemResData = itemRes.data;
                    const googleSheetName = services.settingFrom.getGoogleSheetName();

                    const data = transformSheetData(itemData, itemResData, keywordsSearch);
                    const resContent = await services.googleSheetService.storeDataToGoogleSheet([data], googleSheetName);

                });
                container ? container.append(addToExcelBtn) : itemElm.append(addToExcelBtn);
            }
            
            var observer = new MutationObserver((mutations) => {
                observer.disconnect();
                const newItemUI = $(`#${itemId}`);
                if (newItemUI.length > 0) {
                    updateUIItem(newItemUI[0]);
                }
            });
            observer.observe(itemElm[0].parentElement, { childList: true });

        }
    }

    function calculateMaxPrice(rentEstimate, livingArea, rehabPerSqft) {
        return ((rentEstimate * dataToCalculate.countOfMonth * dataToCalculate.percentageAfterExpenses) /
            dataToCalculate.desiredProfitPercentage) -
            ((livingArea * rehabPerSqft) + (dataToCalculate.entrepreneurFee))
    }

    function numberWithCommas(x) {
        return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

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

    function transformSheetData(property, propertyData, keywordsSearch) {
        return {
            ID: propertyData?.property.zpid,
            agentName: propertyData?.property.attributionInfo.agentName,
            agentPhoneNumber: propertyData?.property.attributionInfo.agentPhoneNumber,
            agentEmail: propertyData?.property.attributionInfo.agentEmail,
            brokerName: propertyData?.property.attributionInfo.brokerName,
            brokerPhoneNumber: propertyData?.property.attributionInfo.brokerPhoneNumber,
            timeInPlatform: propertyData?.property.timeOnZillow,
            Role: propertyData?.property.listing_sub_type.is_FSBO ? 'FSBO' : propertyData?.property.listing_sub_type.is_FSBA ? 'FSBA' : '',
            Link: `https://www.zillow.com/homedetails/${propertyData?.property.address.streetAddress.replace(/ /g, "-")}-${propertyData?.property.address.city.replace(/ /g, "-")}-${propertyData?.property.address.state.replace(/ /g, "-")}-${propertyData?.property.address.zipcode.replace(/ /g, "-")}/${propertyData?.property.zpid}_zpid/`,
            Address: `${propertyData?.property.address.streetAddress}, ${propertyData?.property.address.city}, ${propertyData?.property.address.state}, ${propertyData?.property.address.zipcode}`,
            Year: propertyData?.property.yearBuilt,
            Type: propertyData?.property.homeType,
            Comments: propertyData?.property.description,
            Beds: propertyData?.property.bedrooms,
            Bathes: propertyData?.property.bathrooms,
            Sqf: propertyData?.property.livingArea,
            Cost: propertyData?.property.price,
            DaysOnZillow: propertyData?.property.daysOnZillow,
            Saved: propertyData?.property.favoriteCount,
            Views: propertyData?.property.pageViewCount,
            PriceHistory: propertyData?.property.priceHistory.map(hp => `${hp.event} - date: ${hp.date}: price: ${hp.price}`).join('\n'),
            RepairCost: 0,
            ARV: 0,
            OtherDetails: '',
            LotSize: propertyData?.property.lotSize,
            // OnSale: 
            zpid: propertyData?.property.zpid,
            rentEstimate: propertyData?.property.rentZestimate,
            keywordsSearch: MOTIVATION_KEYWORDS.filter(keyword => propertyData?.property.description?.indexOf(keyword) > -1).join(', '),
            source: 'Zillow'
        }
    }
    function delay(delay, message){
        return new Promise((resolve) => setTimeout(function(){
          console.log(message); 
          resolve();
        }, delay))
    }
    

    $(document).ready(() => {
        init();
    })
})(jQuery);

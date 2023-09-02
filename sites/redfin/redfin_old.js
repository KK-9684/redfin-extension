import {
    IMH_KM_DISTANCE_TO_COMPARISON,
    IMH_PRECENTAGE_UNDER_AVG_TO_COMPARISON,
    IMH_MAX_HOME_PRICE_TO_COMPARISON,
    IMH_PRECENTAGE_PRICE_TO_SQF_AVG_TO_COMPARISON,
    IMH_MINIMUM_PROPERTIES_TO_COMPS
} from '../consts/localStorage.consts.js';
import { NotificationService, NOTIFICATION_TYPES } from '../services/notification/notification.service.js';
import { FloatingMenu } from '../services/floatingMenu/floatingMenu.js';
import { SettingFrom } from '../services/settingsForm/settingsForm.js';
import { GoogleSheetService } from '../services/googleSheet/googleSheet.service.js';

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
        googleSheetService: null
    };

    const rehabPerSqft = {
        small: 4,
        medium: 8,
        big: 15
    };

    const ELEMENT_IDS = {
        divPotentialPricePropertiesContent: 'divPotentialPricePropertiesContent',
        divPotentialSqfAvgPricePropertiesContent: 'divPotentialSqfAvgPricePropertiesContent',
        divPropertiesTimeOnMarket: 'divPropertiesTimeOnMarket',
    }

    const dataToCalculate = {
        countOfMonth: 12,
        percentageAfterExpenses: 0.6,
        desiredProfitPercentage: 0.09,
        entrepreneurFee: 5000
    };

    

    const IMHstate = {
        divContent: null,
        requestsResList: new Map(),
        itemsFound: new Map(),
        propertiesDetails: {},
        currentMapSaleProperties: null,
        currentMapSoldProperties: null,
        potentialProperties: {
            saleToSalePrice: {},
            saleToSoldPrice: {},
            saleTosaleSqfPrice: {},
            saleToSoldSqfPrice: {}
        },
    };

    function init() {
        services.notificationService = new NotificationService();
        services.floatingMenu = new FloatingMenu($('body'));
        services.settingFrom = new SettingFrom(services.notificationService, services.floatingMenu);
        services.googleSheetService = new GoogleSheetService(services.notificationService);
        overrideGlobalFetch();
        hookPageChanged();

        services.floatingMenu.addItemToFloatingMenu('imh--upload-properties-button', `<svg style="width:24px;height:24px" viewBox="0 0 24 24">
            <path fill="currentColor" d="M9,14V8H5L12,1L19,8H15V14H9M5,18V16H19V18H5M19,20H5V22H19V20Z" />
        </svg>`, onUploadPropertiesClicked, 'imh--upload-properties-button');

        createPotentialPropertiesWrapperElement(ELEMENT_IDS.divPotentialSqfAvgPricePropertiesContent, 'Comps by SQF AVG', 'SQF AVG Comps',
            `<svg style="width:24px;height:24px" viewBox="0 0 24 24">
            <path fill="currentColor" d="M20 2H4C2.9 2 2 2.9 2 4V20C2 21.11 2.9 22 4 22H20C21.11 22 22 21.11 22 20V4C22 2.9 21.11 2 20 2M4 6L6 4H10.9L4 10.9V6M4 13.7L13.7 4H18.6L4 18.6V13.7M20 18L18 20H13.1L20 13.1V18M20 10.3L10.3 20H5.4L20 5.4V10.3Z" />
        </svg>`);

        createPotentialPropertiesWrapperElement(ELEMENT_IDS.divPotentialPricePropertiesContent, 'Comps by Price AVG', 'PRICE AVG Comps',
            `<svg style="width:24px;height:24px" viewBox="0 0 24 24">
            <path fill="currentColor" d="M7,15H9C9,16.08 10.37,17 12,17C13.63,17 15,16.08 15,15C15,13.9 13.96,13.5 11.76,12.97C9.64,12.44 7,11.78 7,9C7,7.21 8.47,5.69 10.5,5.18V3H13.5V5.18C15.53,5.69 17,7.21 17,9H15C15,7.92 13.63,7 12,7C10.37,7 9,7.92 9,9C9,10.1 10.04,10.5 12.24,11.03C14.36,11.56 17,12.22 17,15C17,16.79 15.53,18.31 13.5,18.82V21H10.5V18.82C8.47,18.31 7,16.79 7,15Z" />
        </svg>`);

        createPotentialPropertiesWrapperElement(ELEMENT_IDS.divPropertiesTimeOnMarket, 'Time on Market', 'PRICE AVG Comps',
            `<svg style="width:24px;height:24px" viewBox="0 0 24 24">
            <path fill="currentColor" d="M12 20C16.4 20 20 16.4 20 12S16.4 4 12 4 4 7.6 4 12 7.6 20 12 20M12 2C17.5 2 22 6.5 22 12S17.5 22 12 22C6.5 22 2 17.5 2 12C2 6.5 6.5 2 12 2M12.5 12.8L7.7 15.6L7 14.2L11 11.9V7H12.5V12.8Z" />
        </svg>`);
    }

    function hookPageChanged() {
        let pathname = location.pathname;
        window.addEventListener("click", function () {
            setTimeout(() => {
                if (location.pathname != pathname) {
                    pathname = location.pathname;
                    updateUIItems();
                }
            }, 1000);
        });
    }

    async function onUploadPropertiesClicked() {
        try {
            services.floatingMenu.updateButtonLoading('imh--upload-properties-button', true);
            const googleSheetName = services.settingFrom.getAutomationGoogleSheetName();
            let list = [];
            Object.keys(IMHstate.propertiesDetails).forEach(key => {
                list.push(transformSheetData(null, IMHstate.propertiesDetails[key].data, ''));
            })
            await services.googleSheetService.storeDataToGoogleSheet(list, googleSheetName);
        } catch (ex) {
            console.error(ex);
        }
        services.floatingMenu.updateButtonLoading('imh--upload-properties-button', false);
    }

    function createPotentialPropertiesWrapperElement(potentialId, header, buttonTitle, svgButtonIcon) {
        const divWrapper = document.createElement('div');
        divWrapper.id = `${potentialId}--wrapper`;
        divWrapper.classList.add('imh-potential-properties--wrapper');

        const closeButton = $(`
        <button class="imh-close-button">
            <svg style="width:24px;height:24px" viewBox="0 0 24 24">
                <path fill="currentColor" d="M13.46,12L19,17.54V19H17.54L12,13.46L6.46,19H5V17.54L10.54,12L5,6.46V5H6.46L12,10.54L17.54,5H19V6.46L13.46,12Z" />
            </svg>
        </button>`);
        closeButton.on('click', () => onPotentialPropertiesToggleClicked(potentialId));
        $(document).on('keyup', (e) => {
            if (e.key == "Escape") {
                closeElement(divWrapper.id);
            }
        });

        $(divWrapper).append(closeButton);

        document.body.appendChild(divWrapper);

        const content = document.createElement('div');
        content.id = `${potentialId}-properties`;
        content.classList.add('imh-potential-properties--content');
        divWrapper.appendChild(content);

        const headerElm = $(`<h3>${header}</h3>`);
        $(content).append(headerElm);

        services.floatingMenu.addItemToFloatingMenu('imh-potential-properties--toggle-button',
            svgButtonIcon,
            () => onPotentialPropertiesToggleClicked(potentialId)
        );
    }

    function onPotentialPropertiesToggleClicked(potentialId) {
        const divWrapper = $(`#${potentialId}--wrapper`);
        if (divWrapper.length > 0) {
            if (divWrapper[0].classList.contains('is-open')) {
                divWrapper[0].classList.remove('is-open');
            } else {
                divWrapper[0].classList.add('is-open');
            }
        }
    }

    function closeElement(elementId) {
        const divWrapper = $(`#${elementId}`);
        if (divWrapper.length > 0) {
            divWrapper[0].classList.remove('is-open');
        }
    }

    /*************************************************/
    /******* Create Proxy of fetch method ************/
    /*************************************************/
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
                    interceptorResponse(data, this);
                }
                onreadystatechange_original.apply(this);
            }

            send_original.apply(this, arguments); // reset/reapply original send method
        }
    }

    async function interceptorResponse(args, response) {
        const resInterceptor = {
            callAfter: null
        };
        if (response.responseURL.indexOf('www.redfin.com/stingray/api/gis?') > -1) {
            const data = response.response.split('{}&&')[1];
            if (data) {
                const keywordsSearch = getKeywordsSearch(response.responseURL);
                // extractDataPlatform(response.responseURL, keywordsSearch, JSON.parse(data));
                onGetSearchPageStateResponse(args, response);
            }
        }

        return resInterceptor;
    }

    async function onGetSearchPageStateResponse(args, response) {
        const maxHomePrice = localStorage.getItem(IMH_MAX_HOME_PRICE_TO_COMPARISON);
        const keywordsSearch = getKeywordsSearch(response.responseURL);
        const resData = response.response.split('{}&&')[1];
        if (resData) {
            const res = JSON.parse(resData);

            let searchType = 'Sale';
            let url = extractUrlOfGetSearchPageStateRequest(response.responseURL);
            let params = extractPramsOfGetSearchPageStateRequest(response.responseURL);

            if (res.payload.homes.length >= SITE_CONFIG.REDFIN_MAX_RESULTS) {
                services.notificationService.notify(`There are too much results, please zoomin`, NOTIFICATION_TYPES.ERROR);
            }

            searchType = detectSearchType(response.responseURL);
            const keyValPairSale = {};
            const keyValPairSqfSale = {};
            switch (searchType) {
                case 'Sale': {
                    IMHstate.currentMapSaleProperties = res.payload.homes;

                    // item to fetch data
                    let index = 0;
                    const itemsDataReqList = IMHstate.currentMapSaleProperties.map(async (itemData) => {
                        if (IMHstate.propertiesDetails[itemData.propertyId] || itemData.price.value > maxHomePrice) {
                            return null;
                        }
                        await delay(350 * index, 'delay');
                        index++;
                        try {
                            return await fetchItemData(itemData.propertyId, itemData.listingId);
                        } catch (ex) {
                            console.error(ex);
                            return null;
                        }
                    });
                    const itemsDataList = await Promise.all(itemsDataReqList);
                    if (itemsDataList) {
                        itemsDataList.forEach(prop => {
                            if (prop) {
                                IMHstate.propertiesDetails[prop.propertyId] = prop;
                            }
                        });
                    }
                    console.log('itemsDataList', itemsDataList);

                    if (IMHstate.currentMapSaleProperties) {
                        // calculate distance between sales properties
                        const potentialProperties = getPotentialPropertiesAndSetCompData(IMHstate.currentMapSaleProperties, IMHstate.currentMapSaleProperties);
                        // console.log('potentialProperties Sale: ', potentialProperties);
                        potentialProperties[0].forEach(element => {
                            keyValPairSale[element.propertyId] = element;
                        });
                        IMHstate.potentialProperties.saleToSalePrice = {
                            ...IMHstate.potentialProperties.saleToSalePrice,
                            ...keyValPairSale
                        }
                        potentialProperties[1].forEach(element => {
                            keyValPairSqfSale[element.propertyId] = element;
                        });
                        IMHstate.potentialProperties.saleTosaleSqfPrice = {
                            ...IMHstate.potentialProperties.saleTosaleSqfPrice,
                            ...keyValPairSqfSale
                        }
                        addPotentialPropertiesToView(ELEMENT_IDS.divPotentialPricePropertiesContent, potentialProperties[0], 'Sale-to-Sale', 'IMHaveragePrice', 'IMHavgPriceComp',
                            (property) => property.price.value,
                        );
                        addPotentialPropertiesToView(ELEMENT_IDS.divPotentialSqfAvgPricePropertiesContent, potentialProperties[1], 'Sale-to-Sale', 'IMHaverageSqfPrice', 'IMHavgSqfPriceComp',
                            (property) => `$${(property.pricePerSqFt.value).toFixed(2).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`,
                        );
                        addPropertiesTimeOnMarketToView(IMHstate.currentMapSaleProperties);
                    }
                    break;
                }
                case 'Sold': {
                    IMHstate.currentMapSoldProperties = res[category]?.searchResults?.mapResults || res?.cat1?.searchResults?.mapResults;
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
                        // addPotentialPropertiesToView(ELEMENT_IDS.divPotentialPricePropertiesContent, potentialProperties[0], 'Sale-to-Sold', 'IMHaveragePrice', 'IMHavgPriceComp',
                        //     (property) => property.price,
                        // );

                        // addPotentialPropertiesToView(ELEMENT_IDS.divPotentialSqfAvgPricePropertiesContent, potentialProperties[1], 'Sale-to-Sold', 'IMHaverageSqfPrice', 'IMHavgSqfPriceComp',
                        // (property) => `$${(property.hdpData.homeInfo.price / property.hdpData.homeInfo.livingArea).toFixed(2).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`,
                        // );
                    }
                    break;
                }
            }
            extractDataPlatform(response.responseURL, keywordsSearch, res);

            // if (args[1]?.imhExtraData?.makePreviouslyCall && args[1]?.imhExtraData?.previoslyReq) {
            //     return () => callGet(args[1].imhExtraData.previoslyReq, {
            //         skipInterceptorRequest: true,
            //         skipInterceptorResponse: args[0]
            //     });
            // }
        }
    }

    function addPotentialPropertiesToView(potentialId, resItem, sectionName, compsFieldNameAvg, compsFieldName, functionPrice) {
        // debugger
        const oldSection = $(`#potential-properties-${potentialId}-${sectionName}`);
        if (oldSection.length) {
            oldSection.remove();
        }
        if (resItem.length) {
            const section = document.createElement('div');
            section.classList.add('potential-properties');
            section.setAttribute('id', `potential-properties-${potentialId}-${sectionName}`);
            section.innerHTML = `<h3>${sectionName}</h3>`;
            const potentialContainer = $(`#${potentialId}-properties`)[0];
            potentialContainer.appendChild(section);

            var table_body = '<table border="1">';
            table_body += `
                <thead>
                    <tr>
                        <th>Link</th>
                        <th>Price</th>
                        <th>Average</th>
                        <th>AvgPriceComp</th>
                        <th>Days On Market</th>
                    </tr>
                </thead>
                <tbody>
            `;

            resItem.forEach(property => {
                const timeOnRefin = dateDiffInDays(new Date(Date.now() - property.timeOnRedfin.value), new Date(Date.now()));
                table_body += '<tr>';

                table_body += '<td>';
                table_body += `
                    <a href="${property.url}" target="_blank">
                        // <img src="${property.imgSrc}">
                        <div>${property.propertyId}</div>
                    </a>
                `;
                table_body += '</td>';

                table_body += '<td>';
                table_body += functionPrice(property);
                table_body += '</td>';

                table_body += '<td>';
                table_body += `$${property[compsFieldNameAvg].toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
                table_body += '</td>';

                table_body += '<td>';
                table_body += `
                    
                        ${property[compsFieldName].map(neighbor => {
                    return `
                                <a href="${neighbor.detailUrl}" target="_blank">
                                    $${functionPrice(neighbor)}
                                </a>
                            `
                }).join(', ')}
                `;
                table_body += '</td>';
                table_body += '<td>';
                table_body += `${timeOnRefin}`;
                table_body += '</td>';

                table_body += '</tr>';
            })

            table_body += '</tbody></table>';
            $(section).append(table_body);
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
                const property = IMHstate.propertiesDetails[resItem.propertyId];
                if (property) {
                    const timeOnRefin = dateDiffInDays(new Date(Date.now() - resItem.timeOnRedfin.value), new Date(Date.now()));
                    if (timeOnRefin <= maximumTimeOnMarket && timeOnRefin >= minimumTimeOnMarket) {
                        table_body += '<tr>';

                        table_body += '<td>';
                        table_body += `
                            <a href="${resItem.url}" target="_blank">
                                <img src="${property?.aboveTheFold?.payload?.mediaBrowserInfo?.photos[0]?.photoUrls?.fullScreenPhotoUrl}">
                                <div>${resItem.propertyId}</div>
                            </a>
                        `;
                        table_body += '</td>';

                        table_body += '<td>';
                        table_body += `$${resItem.price.value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
                        table_body += '</td>';

                        table_body += '<td>';
                        table_body += `${timeOnRefin}`;
                        table_body += '</td>';
                        table_body += '</tr>';
                    }
                }
            })

            table_body += '</tbody></table>';
            $(section).append(table_body);
        }
    }

    function getPotentialPropertiesAndSetCompData(list1, list2) {
        const maxDistance = localStorage.getItem(IMH_KM_DISTANCE_TO_COMPARISON);
        const precUnderAvg = localStorage.getItem(IMH_PRECENTAGE_UNDER_AVG_TO_COMPARISON);
        const precUnderSqfAvg = localStorage.getItem(IMH_PRECENTAGE_PRICE_TO_SQF_AVG_TO_COMPARISON);
        const maxHomePrice = localStorage.getItem(IMH_MAX_HOME_PRICE_TO_COMPARISON);
        const minPropsToComps = localStorage.getItem(IMH_MINIMUM_PROPERTIES_TO_COMPS);

        const potentialAvgPrice = [];
        const potentialSqfAvgPrice = [];
        for (const property of list1) {
            property.IMHavgPriceComp = [];
            property.IMHavgSqfPriceComp = [];
            for (const property2 of list2) {
                if (property.propertyId !== property2.propertyId) {
                    if (calcCrow(property.latLong.value, property2.latLong.value) <= maxDistance) {
                        property.IMHavgPriceComp.push(property2);
                        property.IMHavgSqfPriceComp.push(property2);
                    }
                }
            }

            let limitPrice = 0;
            property.IMHaveragePrice = (property.IMHavgPriceComp.map(neighbor => neighbor.price.value).reduce((a, b) => a + b, 0) / property.IMHavgPriceComp.length).toFixed(2);
            limitPrice = property.IMHaveragePrice * precUnderAvg;
            if (property.price.value <= limitPrice) {
                if (property.price.value < maxHomePrice) {
                    if (property.IMHavgPriceComp.length >= minPropsToComps) {
                        potentialAvgPrice.push(property);
                    }
                }
            }

            property.IMHaverageSqfPrice = (property.IMHavgSqfPriceComp.map(neighbor => neighbor.pricePerSqFt.value).reduce((a, b) => a + b, 0) / property.IMHavgSqfPriceComp.length).toFixed(2);
            limitPrice = property.IMHaverageSqfPrice * precUnderSqfAvg;
            if (property.pricePerSqFt.value <= limitPrice) {
                if (property.price.value < maxHomePrice) {
                    if (property.IMHavgSqfPriceComp.length >= minPropsToComps) {
                        potentialSqfAvgPrice.push(property);
                    }
                }
            }

        }
        return [potentialAvgPrice, potentialSqfAvgPrice];
    }

    function extractUrlOfGetSearchPageStateRequest(responseURL) {
        const url = responseURL.split('?')[0];
        return url;
    }

    function extractPramsOfGetSearchPageStateRequest(responseURL) {
        let params = responseURL.split('?')[1];
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

    /*********************************************/
    /*******Extract data from response************/
    /*********************************************/
    async function extractDataPlatform(url, keywordsSearch, data) {
        const listResults = data?.payload?.homes;
        if (listResults) {
            console.log(listResults);
            const resMapped = listResults
                .map((item) => {
                    try {

                        return {
                            ...item,
                            maxPriceSmallRehab: calculateMaxPrice(0, item.sqFt.value, rehabPerSqft.small),
                            maxPriceMediumRehab: calculateMaxPrice(0, item.sqFt.value, rehabPerSqft.medium),
                            maxPriceBigRehab: calculateMaxPrice(0, item.sqFt.value, rehabPerSqft.big),
                        }
                    }
                    catch (ex) {
                        debugger
                    }
                })

            console.log('resMapped: ', resMapped);

            keepRequestRes(url, keywordsSearch, resMapped);

            setTimeout(() => {
                updateUIItems();
            }, 1000);
        }
    }

    function getKeywordsSearch(url) {
        let s = decodeURI(url).split('?')[1];
        let result = {};
        s.split('&').forEach(function (pair) {
            pair = pair.split('=');
            result[pair[0]] = decodeURIComponent(pair[1] || '');

        });
        return result?.ft;
    }

    async function keepRequestRes(url, keywordsSearch, data) {
        const results = { url, data, keywordsSearch };
        IMHstate.requestsResList.set(url, results);

        data.forEach(itemData => {
            IMHstate.itemsFound.set(`${itemData.propertyId}`, { itemData, keywordsSearch });
        });

        // addResultsToView(results, url);
    }

    function addResultsToView(resItem, id) {
        const button = document.createElement('button');
        button.innerHTML = `${resItem.data.length} items`;
        button.setAttribute('data-imh-id', id);
        IMHstate.divContent.appendChild(button);
        button.addEventListener("click", async (elm) => {
            const dataIndex = elm.target.getAttribute('data-imh-id');
            if (IMHstate.requestsResList.has(id)) {
                const data = IMHstate.requestsResList.get(id).data;
                const googleSheetName = services.settingFrom.getGoogleSheetName();
                for (item of data) {
                    await storeDataToGoogleSheet(item, googleSheetName);
                }
            }
        });
    }

    function updateUIItems() {
        const itemsOnUI = $('.HomeCard');
        for (let itemOnUI of itemsOnUI) {
            updayeUIItem(itemOnUI);
        }
    }

    function updayeUIItem(itemOnUI) {
        const aTag = $(itemOnUI).find('a');
        const href = aTag[0]?.href;
        if (href) {
            let hrefsplitted = href.split('/');
            if (hrefsplitted.length > 0) {
                const propertyId = hrefsplitted[hrefsplitted.length - 1];

                const itemElm = $(itemOnUI);
                const itemData = IMHstate.itemsFound.get(propertyId).itemData;
                const keywordsSearch = IMHstate.itemsFound.get(propertyId).keywordsSearch;

                const redfinInteractiveElm = itemElm.find('.interactive');

                itemElm.addClass('him-auto-height');
                itemElm.find(".him-list-rehab-max-price").remove();
                itemElm.find('.him-button-add-to-xls').remove();

                const rehabList = $(`
                    <div class="him-list-rehab-max-price">
                        <div class="him-rehab-max-price-item 
                            him-small-rehab
                            ${itemData.maxPriceSmallRehab > itemData.price ? 'him-rehab-max-price-item--good' : 'him-rehab-max-price-item--bad'}">
                                ${numberWithCommas(itemData.maxPriceSmallRehab.toFixed(3))}
                        </div>
                        <div class="him-rehab-max-price-item 
                            him-med-rehab
                            ${itemData.maxPriceMediumRehab > itemData.price ? 'him-rehab-max-price-item--good' : 'him-rehab-max-price-item--bad'}">
                                ${numberWithCommas(itemData.maxPriceMediumRehab.toFixed(3))}
                        </div>
                        <div class="him-rehab-max-price-item 
                            him-big-rehab
                            ${itemData.maxPriceBigRehab > itemData.price ? 'him-rehab-max-price-item--good' : 'him-rehab-max-price-item--bad'}">
                                ${numberWithCommas(itemData.maxPriceBigRehab)}
                        </div>
                    </div>`
                );

                redfinInteractiveElm.append(rehabList);

                const addToExcelBtn = $(`<button class="him-button-add-to-xls">add to excel</button>`).click(async (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    // const itemRes = await fetchItemData(itemData.zpid);
                    // Initialize the DOM parser
                    // var parser = new DOMParser();

                    // Parse the text
                    // var doc = parser.parseFromString(itemRes, "text/html");
                    // itemData = itemRes.data;

                    const itemRes = await fetchItemData(itemData.propertyId, itemData.listingId);
                    const data = transformSheetData(itemRes, itemData);
                    const googleSheetName = services.settingFrom.getGoogleSheetName();
                    const resContent = await services.googleSheetService.storeDataToGoogleSheet([data], googleSheetName);
                });
                redfinInteractiveElm.append(addToExcelBtn);

                var observer = new MutationObserver((mutations) => {
                    observer.disconnect();
                    updayeUIItem(item);
                });
                observer.observe(itemElm[0].parentElement, { childList: true });
            }
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

    // async function fetchItemData(zpid) {
    //     const url = 'https://www.redfin.com/IN/Indianapolis/1701-Woodlawn-Ave-46203/home/82156453';

    //     const response = await fetch(url);
    //     return response.text(); // parses 
    // }

    async function fetchItemData(propertyId, listingId) {
        try {
            const aboveTheFoldUrl = `https://www.redfin.com/stingray/api/home/details/aboveTheFold?propertyId=${propertyId}&accessLevel=1`
            const belowTheFoldUrl = `https://www.redfin.com/stingray/api/home/details/belowTheFold?propertyId=${propertyId}&accessLevel=1&listingId=${listingId}&pageType=1`;
            const onMarketUrl = `https://www.redfin.com/stingray/api/home/details/customerConversionInfo/onMarket?propertyId=${propertyId}&accessLevel=1&listingId=${listingId}&pageType=1`;
            const mainHouseInfoPanelInfoUrl = `https://www.redfin.com/stingray/api/home/details/mainHouseInfoPanelInfo?propertyId=${propertyId}&listingId=${listingId}&accessLevel=1`;

            const mapApisKeys = new Map([
                [aboveTheFoldUrl, 'aboveTheFold'],
                [belowTheFoldUrl, 'belowTheFold'],
                [onMarketUrl, 'onMarket'],
                [mainHouseInfoPanelInfoUrl, 'mainHouseInfoPanelInfo'],
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

    function transformSheetData(itemRes, itemData) {
        
        return {
            ID: itemData.propertyId,
            agentName: itemRes.onMarket.payload.mlsDisclaimerInfo?.listingAgentName || itemRes.belowTheFold.payload?.amenitiesInfo?.mlsDisclaimerInfo?.listingAgentName,
            agentPhoneNumber: itemRes.onMarket.payload.mlsDisclaimerInfo?.listingAgentNumber || itemRes.belowTheFold?.payload?.amenitiesInfo?.mlsDisclaimerInfo?.listingAgentNumber,
            agentEmail: itemRes?.mainHouseInfoPanelInfo?.mainHouseInfo?.listingContactInfo,
            brokerName: itemRes.onMarket.payload.mlsDisclaimerInfo?.listingBrokerName,
            brokerPhoneNumber: itemRes.onMarket.payload.mlsDisclaimerInfo?.listingBrokerNumber,
            DaysInPlatform: dateDiffInDays(new Date(Date.now() - itemData.timeOnRedfin.value), new Date(Date.now())),
            Role: 'Todo',
            Link: `https://www.redfin.com${itemData.url}`,
            Address: `${itemData.streetLine.value}, ${itemData.city}, ${itemData.state}, ${itemData.zip}`,
            Year: itemData.yearBuilt.value,
            Type: itemRes.belowTheFold.payload.publicRecordsInfo.basicInfo.propertyTypeName,
            Comments: itemRes?.mainHouseInfoPanelInfo?.mainHouseInfo?.marketingRemarks?.map(remark => remark?.marketingRemark).join(' '),
            Beds: itemData.beds,
            Bathes: itemData.baths,
            Sqf: itemData.sqFt.value,
            Cost: itemData.price.value,
            RepairCost: 0,
            ARV: 0,
            OtherDetails: '',
            LotSize: itemData.lotSize.value,
            rentEstimate: 'Todo',
            keywordsSearch: keywordsSearch,
            source: 'Redfin',
            Saved: 'Todo',
            Views: 'Todo',
            PriceHistory: itemRes.belowTheFold.payload.propertyHistoryInfo.events.map(hp => `${hp.eventDescription} - date: ${formatDate(hp.eventDate)}: price: ${hp.price}`).join('\n'),
            latitude: itemData.latLong.value.latitude,
            longitude: itemData.latLong.value.longitude,
            MlsID: itemData.mlsId.value,
            // OnSale: 
        }
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

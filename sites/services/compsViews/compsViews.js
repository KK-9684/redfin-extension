import {
  IMH_KM_DISTANCE_TO_COMPARISON,
  IMH_PRECENTAGE_UNDER_AVG_TO_COMPARISON,
  IMH_MAX_HOME_PRICE_TO_COMPARISON,
  IMH_PRECENTAGE_PRICE_TO_SQF_AVG_TO_COMPARISON,
  IMH_MINIMUM_PROPERTIES_TO_COMPS
} from '../../consts/localStorage.consts.js';

import {
  ELEMENT_IDS,
  RECOMMENDATION_DATA_TO_CALCULATE
} from './compsViews.config.js';

export class CompsViews {

  settingFrom;
  floatingMenu;
  googleSheetService;

  lastSearchImhTransformed = {
    sale: [],
    sold: [],
  };

  propertiesDetailsHash = {};

  comparedProperties = {
    saleToSalePrice: {},
    saleToSaleSqfPrice: {},
    saleToSoldPrice: {},
    saleToSoldSqfPrice: {},
  }

  constructor(settingFrom, floatingMenu, googleSheetService) {
    this.settingFrom = settingFrom;
    this.floatingMenu = floatingMenu;
    this.googleSheetService = googleSheetService;

    this.createPotentialPropertiesWrapperElement(ELEMENT_IDS.divPotentialSqfAvgPricePropertiesContent, 'Comps by SQF AVG', 'SQF AVG Comps',
      `<svg style="width:24px;height:24px" viewBox="0 0 24 24">
            <path fill="currentColor" d="M20 2H4C2.9 2 2 2.9 2 4V20C2 21.11 2.9 22 4 22H20C21.11 22 22 21.11 22 20V4C22 2.9 21.11 2 20 2M4 6L6 4H10.9L4 10.9V6M4 13.7L13.7 4H18.6L4 18.6V13.7M20 18L18 20H13.1L20 13.1V18M20 10.3L10.3 20H5.4L20 5.4V10.3Z" />
        </svg>`);

    this.createPotentialPropertiesWrapperElement(ELEMENT_IDS.divPotentialPricePropertiesContent, 'Comps by Price AVG', 'PRICE AVG Comps',
      `<svg style="width:24px;height:24px" viewBox="0 0 24 24">
            <path fill="currentColor" d="M7,15H9C9,16.08 10.37,17 12,17C13.63,17 15,16.08 15,15C15,13.9 13.96,13.5 11.76,12.97C9.64,12.44 7,11.78 7,9C7,7.21 8.47,5.69 10.5,5.18V3H13.5V5.18C15.53,5.69 17,7.21 17,9H15C15,7.92 13.63,7 12,7C10.37,7 9,7.92 9,9C9,10.1 10.04,10.5 12.24,11.03C14.36,11.56 17,12.22 17,15C17,16.79 15.53,18.31 13.5,18.82V21H10.5V18.82C8.47,18.31 7,16.79 7,15Z" />
        </svg>`);

    this.createPotentialPropertiesWrapperElement(ELEMENT_IDS.divPropertiesTimeOnMarket, 'Time on Market', 'PRICE AVG Comps',
      `<svg style="width:24px;height:24px" viewBox="0 0 24 24">
            <path fill="currentColor" d="M12 20C16.4 20 20 16.4 20 12S16.4 4 12 4 4 7.6 4 12 7.6 20 12 20M12 2C17.5 2 22 6.5 22 12S17.5 22 12 22C6.5 22 2 17.5 2 12C2 6.5 6.5 2 12 2M12.5 12.8L7.7 15.6L7 14.2L11 11.9V7H12.5V12.8Z" />
        </svg>`);
  }

  createPotentialPropertiesWrapperElement(potentialId, header, buttonTitle, svgButtonIcon) {
    const divWrapper = document.createElement('div');
    divWrapper.id = `${potentialId}--wrapper`;
    divWrapper.classList.add('imh-potential-properties--wrapper');

    const closeButton = $(`
    <button class="imh-close-button">
        <svg style="width:24px;height:24px" viewBox="0 0 24 24">
            <path fill="currentColor" d="M13.46,12L19,17.54V19H17.54L12,13.46L6.46,19H5V17.54L10.54,12L5,6.46V5H6.46L12,10.54L17.54,5H19V6.46L13.46,12Z" />
        </svg>
    </button>`);
    closeButton.on('click', () => this.onPotentialPropertiesToggleClicked(potentialId));
    $(document).on('keyup', (e) => {
      if (e.key == "Escape") {
        this.closeElement(divWrapper.id);
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

    this.floatingMenu.addItemToFloatingMenu('imh-potential-properties--toggle-button',
      svgButtonIcon,
      () => this.onPotentialPropertiesToggleClicked(potentialId)
    );
  }

  onPotentialPropertiesToggleClicked(potentialId) {
    const divWrapper = $(`#${potentialId}--wrapper`);
    if (divWrapper.length > 0) {
      if (divWrapper[0].classList.contains('is-open')) {
        divWrapper[0].classList.remove('is-open');
      } else {
        divWrapper[0].classList.add('is-open');
      }
    }
  }

  addPotentialPropertiesToView(potentialId, resItem, sectionName, compsFieldNameAvg, compsFieldName, functionPrice, onHoverRowCallback) {
    // debugger
    const oldSection = $(`#potential-properties-${potentialId}-${sectionName}`);
    if (oldSection.length) {
      oldSection.remove();
    }
    if (resItem.length) {
      const section = $('<div></div>')
      section.addClass('potential-properties');
      section.attr('id', `potential-properties-${potentialId}-${sectionName}`);
      section.innerHTML = `<h3>${sectionName}</h3>`;
      const potentialContainer = $(`#${potentialId}-properties`)[0];
      potentialContainer.appendChild(section[0]);

      let table = $('<table border="1"></table>');
      let thead = `
            <thead>
                <tr>
                    <th>Link</th>
                    <th>Price</th>
                    <th>Average</th>
                    <th>AvgPriceComp</th>
                    <th>Days On Market</th>
                </tr>
            </thead>
        `;

      table.append(thead);

      let table_body = $('<tbody></tbody>');
      resItem.forEach(property => {
        let row = $('<tr></tr>');

        if (onHoverRowCallback) {
          row.hover(
            (ev) => {
              onHoverRowCallback(true, property);
            }, (ev) => {
              onHoverRowCallback(false, property);
            });
        }

        let linkTd = `<td>
                <a href="${property?.imhData?.Link}" target="_blank">
                    <img src="${property?.imhData?.imgSrc}">
                    <div>${property?.imhData.ID}</div>
                </a>
                </td>`;
        row.append(linkTd);

        let priceTd = `<td>
            ${functionPrice(property?.imhData)}
          </td>`;
        row.append(priceTd);

        let averageTd = `<td>
          $${property[compsFieldNameAvg].toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
        </td>`;
        row.append(averageTd);

        let avgPriceCompTd = `<td>                
                    ${property[compsFieldName].map(neighbor => {
          return `
                            <a href="${neighbor?.imhData?.Link}" target="_blank">
                                $${functionPrice(neighbor?.imhData)}
                            </a>
                        `
        }).join(', ')}
        </td>`;
        row.append(avgPriceCompTd);


        let daysOnMarketTd = `<td>
          ${property?.imhData?.DaysInPlatform}
          </td>`;
        row.append(daysOnMarketTd);


        table_body.append(row);
      })

      table.append(table_body);
      section.append(table);
    }
  }

  addPropertiesTimeOnMarketToView(resItems, onHoverRowCallback) {
    const minimumTimeOnMarket = this.settingFrom.getMinimumTimeOnMarket();
    const maximumTimeOnMarket = this.settingFrom.getMaximumTimeOnMarket();
    const maxHomePrice = localStorage.getItem(IMH_MAX_HOME_PRICE_TO_COMPARISON);
    const minPropsToComps = localStorage.getItem(IMH_MINIMUM_PROPERTIES_TO_COMPS);

    const oldSection = $(`#${ELEMENT_IDS.divPropertiesTimeOnMarket}-section`);
    if (oldSection.length) {
      oldSection.remove();
    }

    const section = $('<div></div>')
    section.addClass('potential-properties');
    section.attr('id', `${ELEMENT_IDS.divPropertiesTimeOnMarket}-section`);
    section.innerHTML = `<h3>Time On Platform</h3>`;
    const container = $(`#${ELEMENT_IDS.divPropertiesTimeOnMarket}-properties`)[0];
    container.appendChild(section[0]);


    let table = $('<table border="1"></table>');
    let thead = `
          <thead>
            <tr>
                <th>Link</th>
                <th>Price</th>
                <th>Days On Market</th>
            </tr>
          </thead>
        `;

    table.append(thead);

    let table_body = $('<tbody></tbody>');

    resItems.forEach(property => {
      if (property?.imhData?.Cost < maxHomePrice && property?.imhData?.Cost > minPropsToComps) {
        if (property?.imhData?.DaysInPlatform <= maximumTimeOnMarket && property?.imhData?.DaysInPlatform >= minimumTimeOnMarket) {
          let row = $('<tr></tr>');

          if (onHoverRowCallback) {
            row.hover(
              (ev) => {
                onHoverRowCallback(true, property);
              }, (ev) => {
                onHoverRowCallback(false, property);
              });
          }

          let linkTd = `<td>
                <a href="${property?.imhData?.Link}" target="_blank">
                    <img src="${property?.imhData?.imgSrc}">
                    <div>${property?.imhData.ID}</div>
                </a>
                </td>`;
          row.append(linkTd);

          let priceTd = `<td>
            $${property?.imhData?.Cost.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
          </td>`;
          row.append(priceTd);

          let daysOnMarketTd = `<td>
          ${property?.imhData?.DaysInPlatform}
          </td>`;
          row.append(daysOnMarketTd);


          table_body.append(row);
        }
      }
    })

    table.append(table_body);
    section.append(table);
  }

  getElementPotentialProperties(potentialId, resItem, sectionName, compsFieldNameAvg, compsFieldName, functionPrice) {
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
        table_body += '<tr>';

        table_body += '<td>';
        table_body += `
                <a href="${property.detailUrl}" target="_blank">
                    <img src="${property.imgSrc}">
                    <div>${property.zpid}</div>
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
        table_body += `${IMHstate.propertiesDetails[property.zpid].data.property.daysOnZillow}`;
        table_body += '</td>';

        table_body += '</tr>';
      })

      table_body += '</tbody></table>';
      $(section).append(table_body);
    }
  }

  getElementPropertiesTimeOnMarketToView(resItems) {
    const oldSection = $(`#${ELEMENT_IDS.divPropertiesTimeOnMarket}-section`);
    if (oldSection.length) {
      oldSection.remove();
    }
    if (IMHstate.propertiesDetails) {
      const minimumTimeOnMarket = this.settingFrom.getMinimumTimeOnMarket();
      const maximumTimeOnMarket = this.settingFrom.getMaximumTimeOnMarket();

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
        if (property) {
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

  closeElement(elementId) {
    const divWrapper = $(`#${elementId}`);
    if (divWrapper.length > 0) {
      divWrapper[0].classList.remove('is-open');
    }
  }

  setLastSearchSaleImhTransformed(saleProps, onHoverRowCallback) {
    this.lastSearchImhTransformed.sale = saleProps;
    this.lastSearchImhTransformed.sale.forEach(property => {
      const comps = this.getPotentialPropertiesAndSetCompData(property, this.lastSearchImhTransformed.sale);
      property.isPotentialAvgPriceSale = comps.isPotentialAvgPrice;
      property.isPotentialSqfAvgPriceSale = comps.isPotentialSqfAvgPrice;
      property.IMHavgPriceCompSale = comps.IMHavgPriceComp;
      property.IMHavgSqfPriceCompSale = comps.IMHavgSqfPriceComp;
      property.IMHaveragePriceSale = comps.IMHaveragePrice;
      property.IMHaverageSqfPriceSale = comps.IMHaverageSqfPrice;
    });

    const priceAvgPotential = this.lastSearchImhTransformed.sale.filter(property => property.isPotentialAvgPriceSale);
    const priceSqfAvgPotential = this.lastSearchImhTransformed.sale.filter(property => property.isPotentialSqfAvgPriceSale);

    this.addPotentialPropertiesToView(ELEMENT_IDS.divPotentialPricePropertiesContent, priceAvgPotential, 'Sale-to-Sale', 'IMHaveragePriceSale', 'IMHavgPriceCompSale',
      (property) => `$${property.Cost.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`,
      onHoverRowCallback,
    );
    this.addPotentialPropertiesToView(ELEMENT_IDS.divPotentialSqfAvgPricePropertiesContent, priceSqfAvgPotential, 'Sale-to-Sale', 'IMHaverageSqfPriceSale', 'IMHavgSqfPriceCompSale',
      (property) => `$${(property.Cost / property.Sqf).toFixed(2).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`,
      onHoverRowCallback,
    );

    this.addPropertiesTimeOnMarketToView(saleProps, onHoverRowCallback);
  }

  setLastSearchSoldImhTransformed(soldProps, onHoverRowCallback) {
    this.lastSearchImhTransformed.sold = soldProps;
    this.lastSearchImhTransformed.sale.forEach(property => {
      const comps = this.getPotentialPropertiesAndSetCompData(property, this.lastSearchImhTransformed.sold);
      property.isPotentialAvgPriceSold = comps.isPotentialAvgPrice;
      property.isPotentialSqfAvgPriceSold = comps.isPotentialSqfAvgPrice;
      property.IMHavgPriceCompSold = comps.IMHavgPriceComp;
      property.IMHavgSqfPriceCompSold = comps.IMHavgSqfPriceComp;
      property.IMHaveragePriceSold = comps.IMHaveragePrice;
      property.IMHaverageSqfPriceSold = comps.IMHaverageSqfPrice;
    });

    const priceAvgPotential = this.lastSearchImhTransformed.sale.filter(property => property.isPotentialAvgPriceSold);
    const priceSqfAvgPotential = this.lastSearchImhTransformed.sale.filter(property => property.isPotentialSqfAvgPriceSold);

    this.addPotentialPropertiesToView(ELEMENT_IDS.divPotentialPricePropertiesContent, priceAvgPotential, 'Sale-to-Sold', 'IMHaveragePriceSold', 'IMHavgPriceCompSold',
      (property) => `$${property.Cost.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`,
      onHoverRowCallback,
    );

    this.addPotentialPropertiesToView(ELEMENT_IDS.divPotentialSqfAvgPricePropertiesContent, priceSqfAvgPotential, 'Sale-to-Sold', 'IMHaverageSqfPriceSold', 'IMHavgSqfPriceCompSold',
      (property) => `$${(property.Cost / property.Sqf).toFixed(2).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`,
      onHoverRowCallback,
    );

  }

  getPotentialPropertiesAndSetCompData(property, list2) {
    const res = {
      isPotentialAvgPrice: false,
      isPotentialSqfAvgPrice: false,
      IMHavgPriceComp: [],
      IMHavgSqfPriceComp: [],
      IMHaveragePrice: 0,
      IMHaverageSqfPrice: 0
    }
    const maxDistance = localStorage.getItem(IMH_KM_DISTANCE_TO_COMPARISON);
    const precUnderAvg = localStorage.getItem(IMH_PRECENTAGE_UNDER_AVG_TO_COMPARISON);
    const precUnderSqfAvg = localStorage.getItem(IMH_PRECENTAGE_PRICE_TO_SQF_AVG_TO_COMPARISON);
    const maxHomePrice = localStorage.getItem(IMH_MAX_HOME_PRICE_TO_COMPARISON);
    const minPropsToComps = localStorage.getItem(IMH_MINIMUM_PROPERTIES_TO_COMPS);
    try {
      if (property.imhData) {
        res.IMHavgPriceComp = [];
        res.IMHavgSqfPriceComp = [];
        for (const property2 of list2) {
          // const property2 = list2[propertyItem2];
          if (property?.imhData?.ID !== property2?.imhData?.ID) {
            const crow = this.calcCrow(
              { latitude: property?.imhData?.latitude, longitude: property?.imhData?.longitude },
              { latitude: property2?.imhData?.latitude, longitude: property2?.imhData?.longitude });
            if (crow <= maxDistance) {
              res.IMHavgPriceComp.push(property2);
              res.IMHavgSqfPriceComp.push(property2);
            }
          }
        }

        let limitPrice = 0;
        res.IMHaveragePrice = (res.IMHavgPriceComp.map(neighbor => neighbor?.imhData?.Cost).reduce((a, b) => a + b, 0) / res.IMHavgPriceComp.length).toFixed(2);
        limitPrice = res.IMHaveragePrice * precUnderAvg;
        if (property?.imhData?.Cost <= limitPrice) {
          if (property?.imhData?.Cost < maxHomePrice) {
            if (res.IMHavgPriceComp.length >= minPropsToComps) {
              res.isPotentialAvgPrice = true;
            }
          }
        }

        res.IMHaverageSqfPrice = (res.IMHavgSqfPriceComp.map(neighbor => neighbor?.imhData?.Cost / neighbor?.imhData?.Sqf).reduce((a, b) => a + b, 0) / res.IMHavgSqfPriceComp.length).toFixed(2);
        limitPrice = res.IMHaverageSqfPrice * precUnderSqfAvg;
        if (property?.imhData?.Cost / property?.imhData.Sqf <= limitPrice) {
          if (property?.imhData?.Cost < maxHomePrice) {
            if (res.IMHavgSqfPriceComp.length >= minPropsToComps) {
              res.isPotentialSqfAvgPrice = true
            }
          }
        }
      }
    } catch (ex) {
      console.error(ex);
    }
    return res;
  }

  // calculate distance between two point of latitude and longitude
  calcCrow(point1, point2) {
    var R = 6371; // km
    var dLat = this.toRad(point2.latitude - point1.latitude);
    var dLon = this.toRad(point2.longitude - point1.longitude);
    var lat1 = this.toRad(point1.latitude);
    var lat2 = this.toRad(point2.latitude);

    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c;
    return d;
  }

  // Converts numeric degrees to radians
  toRad(Value) {
    return Value * Math.PI / 180;
  }

  getRecommendationPriceBeforeRehab(property) {
    const rehabPerSqf = this.settingFrom.getRehubSqfPrice();
    return {
      maxPriceSmallRehab: this.calculateRecommendationMaxPrice(property.rentEstimate, property.Sqf, rehabPerSqf.small),
      maxPriceMediumRehab: this.calculateRecommendationMaxPrice(property.rentEstimate, property.Sqf, rehabPerSqf.medium),
      maxPriceBigRehab: this.calculateRecommendationMaxPrice(property.rentEstimate, property.Sqf, rehabPerSqf.big),
    }
  }

  calculateRecommendationMaxPrice(rentEstimate, livingArea, rehabPerSqft) {
    return ((rentEstimate * RECOMMENDATION_DATA_TO_CALCULATE.countOfMonth * RECOMMENDATION_DATA_TO_CALCULATE.percentageAfterExpenses) /
      RECOMMENDATION_DATA_TO_CALCULATE.desiredProfitPercentage) -
      ((livingArea * rehabPerSqft) + (RECOMMENDATION_DATA_TO_CALCULATE.entrepreneurFee))
  }

  getUICardItem(getUICardItem, onAddToExcelBtnClickedCB) {
    const res = {
      container: $(`<div class="imh-card-data-container"></div>`),
      backgroundColor: [],
    }
    const imhItem = this.lastSearchImhTransformed.sale.find(prop => prop.imhData.ID == getUICardItem);
    if (imhItem) {
      if (imhItem.isPotentialAvgPriceSold) {
        res.backgroundColor.push('#6ef26e');
        const soldComps = $(`<div class="him-sold-comps">
                                        <div><b>Sold Comps</b></div>
                                        <div>
                                        ${imhItem.IMHavgPriceCompSold.map(neighbor => {
          return `
                                                <a href="${neighbor.imhData.Link}" target="_blank" onclick="window.open('${neighbor.imhData.Link}', '_blank')">
                                                    $${neighbor.imhData.Cost.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                                                </a>
                                            `
        }).join(', ')}
                                        </div>
                                    </div>
                                    `);
        res.container.append(soldComps);
      }

      if (imhItem.isPotentialAvgPriceSale) {
        res.backgroundColor.push('yellow');
        const saleComps = $(`<div class="him-sale-comps">
                                        <div><b>Sale Comps</b></div>
                                        <div>
                                        ${imhItem.IMHavgPriceCompSale.map(neighbor => {
          return `
                                                <a href="${neighbor.imhData.Link}" target="_blank" onclick="window.open('${neighbor.imhData.Link}', '_blank')">
                                                    $${neighbor.imhData.Cost.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                                                </a>
                                            `
        }).join(', ')}
                                        </div>
                                    </div>
                                    `)

        res.container.append(saleComps);
      }
      // container.css('background', backgroundColor.length > 1 ? `linear-gradient(${backgroundColor})` : backgroundColor);

      if (imhItem.imhData.DaysInPlatform) {
        const daysOnMarket = imhItem.imhData.DaysInPlatform;
        const daysOnMarketDiv = $(`<div class="imh-days-on-market">Days On Market: ${daysOnMarket}</div>`);
        res.container.append(daysOnMarketDiv);
      }

      const rehabList = $(`
                <div class="him-list-rehab-max-price">
                    <div class="him-rehab-max-price-item 
                        him-small-rehab
                        ${imhItem.recomendationPrice.maxPriceSmallRehab > imhItem.imhData.Cost ? 'him-rehab-max-price-item--good' : 'him-rehab-max-price-item--bad'}">
                            ${this.getNumberWithCommas(imhItem.recomendationPrice.maxPriceSmallRehab.toFixed(3))}
                    </div>
                    <div class="him-rehab-max-price-item 
                        him-med-rehab
                        ${imhItem.recomendationPrice.maxPriceMediumRehab > imhItem.imhData.Cost ? 'him-rehab-max-price-item--good' : 'him-rehab-max-price-item--bad'}">
                            ${this.getNumberWithCommas(imhItem.recomendationPrice.maxPriceMediumRehab.toFixed(3))}
                    </div>
                    <div class="him-rehab-max-price-item 
                        him-big-rehab
                        ${imhItem.recomendationPrice.maxPriceBigRehab > imhItem.imhData.Cost ? 'him-rehab-max-price-item--good' : 'him-rehab-max-price-item--bad'}">
                            ${this.getNumberWithCommas(imhItem.recomendationPrice.maxPriceBigRehab)}
                    </div>
                </div>`
      );

      res.container.append(rehabList);

      const addToExcelBtn = $(`<button class="him-button-add-to-xls">add to excel</button>`).click(async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        onAddToExcelBtnClickedCB(imhItem);
      });
      res.container.append(addToExcelBtn);

      res.container.css('background', res.backgroundColor.length > 1 ? `linear-gradient(${res.backgroundColor})` : res.backgroundColor);
    }

    return res;
  }

  getNumberWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
}
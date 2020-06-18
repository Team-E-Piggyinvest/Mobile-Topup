var g_selection = {};
var g_userPath;
var g_selectedOffer;
var g_selectedCurrency;

var g_offersByCode = {};
var g_offersByUid = {};

var g_categories = {};
var g_currencies = {};
var PC_OM = 1;
var PC_PP = 6;
var g_opGuessed;
var g_dbg = false;

var g_eecLists = {};

var $phoneInput = $("#phone");
var $offersDiv = $("#js-offers");
var $offersBlockDiv = $("#js-offers-selection");

// ====================================================================================================
// == AUTOMATIC FILL THE BEGINNING OF THE FUNNEL
// ====================================================================================================

if (isInFunnelCountryPage()) applyLandingContext(typeof g_replayCtx === 'undefined' ? null : g_replayCtx);

function isInFunnelCountryPage() {
    return typeof g_country !== 'undefined';
}

function applyLandingContext(ctx) {
    g_userPath = ctx == null ? "nominal" : ctx.selectedOfferCode ? "direct_to_summary" : "direct_to_offers";
    g_selection["country"] = g_country;
    $phoneInput.prop("placeholder", "1234567890".substring(0, g_country.nbd));
    if (ctx != null) {
        if (g_dbg) console.log(JSON.stringify(ctx));
        $phoneInput.val(ctx.phone);
        processPhoneSubmit(ctx.phone, false);
        processFindOffersResult(ctx.getOffersResp, false, ctx.operatorCode);
        if (ctx.selectedOfferCode) selectOffer(ctx.selectedOfferCode);
    }
}

// ====================================================================================================
// == COUNTRY SELECTION
// ====================================================================================================

$("#js-country-select").on("change", function () {
    var countryCode = $(this).find("option:selected").prop("value") || "";
    dlPush({event: "selectCountry", targetCountry: countryCode});
    var url = g_country_redirect_urls[countryCode] || "/";
    window.location.href = url;
});

$("#changeCountryBtn").on("click", function () {
    $('.countryDisplayElement').collapse('hide');
    $('#countrySelectBlock').collapse('show');
    gtmEventByName("clickchangeCountryBtn");
});


// ====================================================================================================
// == PHONE
// ====================================================================================================

// Display last recharged phones
if (isInFunnelCountryPage()) showLastRechargedNumbers();

$("button.last-recharged").click(function () {
    $(".last-recharged").removeClass("active");
    $(this).addClass("active");
    $("button.last-recharged").not(this).hide("fast");
    gtmEventByName("lastRechargedPhoneBtn");
    processPhoneSubmit($(this).val(), true);
});

function showLastRechargedNumbers() {
    var lastRechargedNumbersCookieValue = getCookie(g_lr_cookie_name);
    if (lastRechargedNumbersCookieValue) {
        var lastRechargedNumbers = lastRechargedNumbersCookieValue.split("-");
        if (lastRechargedNumbers.length > 0) {
            var $blk = $("#last-recharged-block");
            if ($blk) {
                var $template = $("button.last-recharged-template");
                for (var i = 0; i < lastRechargedNumbers.length; i++) {
                    var localPhoneNumber = lastRechargedNumbers[i];
                    var i18nPhoneNumber = "+" + g_country.prefix + " " + localPhoneNumber;
                    var $btn = $template.clone().addClass("last-recharged").text(i18nPhoneNumber).val(localPhoneNumber);
                    $blk.append($btn);
                    $btn.show();
                }
                $blk.show();
                gtmEventByName("showLastRecharged");
            }
        }
    }
}

// user submits a phone number
$("#phone-btn").click(function () {
    dlPush({event: "clickSubmitPhoneNumberBtn"});
    processPhoneSubmit($("#phone").val(), true);
});


function processPhoneSubmit(phoneFieldValue, manualInteraction) {
    uiHidePhoneErrorMessages();
    $(".js-clr-phone").hide();
    g_selection.phone = cleanPhoneNumber(phoneFieldValue);
    $phoneInput.val(g_selection.phone);
    if (!isValidCleanedPhoneNumber(g_selection.phone, g_selection.country.nbd)) {
        dlPush({event: "submitInvalidPhone", targetCountry: g_selection.country.code});
        uiUpdateInvalidPhone(g_selection.country.nbd);
    } else {
        dlPush({event: "submitPhoneNumberWithCountry", targetCountry: g_selection.country.code});
        if (manualInteraction) {
            findOffers(g_selection.country.code, g_selection.phone, null);
        }
    }
}

function cleanPhoneNumber(pn) {
    return pn.replace(/\D/g, '');
}

function isValidCleanedPhoneNumber(cpn, nbd) {
    return new RegExp("^\\d{" + nbd + "}$").test(cpn);
}

// user puts focus in phone field
$phoneInput.focus(function () {
    uiUpdateAfterPhoneUpdate();
});

function uiUpdateAfterPhoneUpdate() {
    $(".js-clr-phone").hide();
    $(".js-offer").remove();
}

function uiHidePhoneErrorMessages() {
    $(".js-err-msg-phone").hide("fast");
}

function uiUpdateInvalidPhone(nbDigits) {
    $("#phone-error-div").show("fast");
    $("#js-nb-digits").text(nbDigits);
    scrollTo("#countryBlock");
}

// ====================================================================================================
// == OPERATOR
// ====================================================================================================

function uiUpdateOperatorOptions(possibleOpCodes) {
    $("input[type=radio][name='operator-choice']").prop("checked", false);
    var possibleIds = new Set(possibleOpCodes.map(function (opCode) {
        return "div-op-choice-" + opCode;
    }));
}

// user wants to change operator selection
$("#js-funnel-op-change").click(function () {
    uiShowOperatorOptionsModal();
    dlPush({event: "wrongOperatorGuess"});
});

function uiShowOperatorOptionsModal() {
    $("#phone-for-op").text("+" + g_selection.country.prefix + " " + g_selection.phone);
    $("#operator-modal").modal("show");
    dlPush({event: "viewSelectOpModal"});
}

// user select alternative operator
$("input[type=radio][name='operator-choice']").change(function () {
    $("#operator-modal").modal("hide");
    if (!g_opGuessed) dlPush({event: "operatorNotGuessed_selectedOption", label: $(this).val()});
    updateAfterOperatorSelected(parseInt($(this).val()), true);
});


// ====================================================================================================
// == OFFERS
// ====================================================================================================

$("#js-funnel-country-change").on("click", function () {
    gtmEventByName("funnelChangeCountry");
    $.redirect('/', "GET");
});

$("#js-funnel-number-change").on("click", function () {
    $("button.last-recharged").show();
    gtmEventByName("funnelChangePhone");
    uiUpdateAfterPhoneUpdate();
    $('#funnelPageBlock').hide();
    $('#countryPageBlock').show();
});

var g_eec = null;

function processFindOffersResult(getOffersResponse, manualInteraction, preSelectedOperatorCode) {
    $("#phone-submit-spinner").hide();
    $("#js-search-again-msg").hide();
    var currencies = getOffersResponse.currencies;
    var proposed = getOffersResponse.proposed;
    var operators = getOffersResponse.operators;
    var ga = getOffersResponse.ga;
    if (operators) {
        uiUpdateOperatorOptions(operators.supported);
        if (operators.guess) {
            g_opGuessed = true;
            updateAfterOperatorSelected(operators.guess, manualInteraction && !proposed);
            uiShowOffers(currencies, proposed, ga);
        } else {
            g_opGuessed = false;
            if (manualInteraction) {
                g_selection.operator = null;
                gtmEventByName("operatorNotGuessed_showOptions");
                uiShowOperatorOptionsModal();
            } else {
                updateAfterOperatorSelected(preSelectedOperatorCode, false);
                uiShowOffers(currencies, proposed, ga);
            }
        }
    } else {
        uiShowOffers(currencies, proposed, ga);
    }
    g_eec = ga;
}

function findOffers(countryCode, phone, operator) {
    $(".js-offer,.offers-cat").remove();
    $("#js-category-picker").hide();
    $("#phone-submit-spinner").show();
    $("#js-search-again-msg").show();
    $.get("/api/offers?p=" + phone + "&c=" + countryCode + (operator ? "&o=" + operator : ""), function (getOffersResponse) {
        processFindOffersResult(getOffersResponse, true, null);
    });
    scrollTo("#title-offers-div");
}

function updateAfterOperatorSelected(selectedOperatorId, shouldFindOffers) {
    uiHideOffers();
    $(".operator-name").text(g_opNames[selectedOperatorId]);
    g_selection.operator = selectedOperatorId;
    $("#title-offers-div").show();
    if (shouldFindOffers) findOffers(g_selection.country.code, g_selection.phone, g_selection.operator);
}

function uiShowOffers(currencies, proposed, ga) {
    // reset GA EEC lists
    g_eecLists = {};
    // collapse country page related element
    $('#countryPageBlock').hide();
    $('#funnelPageBlock').show();
    // display selected options
    $("#offer-display-phone").text("+" + g_selection.country.prefix + " " + $phoneInput.val());
    $(".js-funnel-op-img").prop("src", g_staticAuthority + g_operatorsLogoPaths[g_selection.operator]);
    // store categories and currencies as they will be needed in UI handlers
    g_categories = proposed.categories;
    g_currencies = currencies;
    // display offers
    var offers = proposed.offers;
    dlPush({event: offers.length === 0 ? "noOffersDisplayed" : "offersDisplayed"});
    $offersBlockDiv.show();
    if (offers.length === 0) {
        $("#no-offer-block").show();
    } else {
        $("#list-offers-title").show();
        // display currencies if more than one
        displayCurrenciesChoiceAndSelectOne(g_currencies, g_currencies.default);

        // display offer categories if more than one
        var selectedCatId = displayCategoriesChoiceAndSelectOne();
        // display offers with special presentation if required
        var $offerTemplate = $(".js-offer-not-highlighted:first");
        if (g_cfgShowHighlight) { // server side configuration variable
            var $offerTemplateHighlighted = $(".js-offer-highlighted:first");
            var $offerTemplateSerenity = $(".js-offer-serenity:first");
            var highlightedOffers = offers.filter(function (o) {
                return o.highlighted;
            });
            var serenityOffers = offers.filter(function (o) {
                return o.serenity;
            });
            var otherOffers = offers.filter(function (o) {
                return (!o.highlighted && !o.serenity);
            });
            showOffers(serenityOffers, $offerTemplateSerenity, selectedCatId, g_currencies, g_selectedCurrency, ga);
            showOffers(highlightedOffers, $offerTemplateHighlighted, selectedCatId, g_currencies, g_selectedCurrency, ga);
            showOffers(otherOffers, $offerTemplate, selectedCatId, g_currencies, g_selectedCurrency, ga);
        } else {
            showOffers(offers, $offerTemplate, selectedCatId, g_currencies, g_selectedCurrency, ga);
        }

        $(".offer-select").click(function () {
            selectOffer($(this).prop("id"));
        });

        $offersDiv.show();

        // build EEC lists
        Object.keys(g_eecLists).forEach(function (catCode) {
            var eecFull = g_eecLists[catCode].map(function (uuid, idx) {
                var eec = ga[uuid];
                eec.position = idx + 1;
                return eec;
            });
            g_eecLists[catCode] = eecFull;
        });

        // notify of list displayed
        eecProductsList(g_eecLists[selectedCatId]);

        // display serenity msg
        var serenityMsg = "";
        if (typeof g_serenityMsg !== 'undefined') {
            serenityMsg = g_serenityMsg;
        }
        $(".serenity-msg:visible:first").text(serenityMsg);
    }

    function displayCurrenciesChoiceAndSelectOne(currencies, selectedCurrency) {
        $(".js-offers-currencies").remove();
        if (currencies.allowed.length > 1) {
            var $tpl = $("#js-currency-tpl");
            currencies.allowed.forEach(function (c, idx) {
                if (idx > 0) {
                    var separator = $("#js-currency-sep-tpl").clone().prop("id", "").addClass("js-offers-currencies").show();
                    $("#js-currency-picker").append(separator);
                }
                var $currencyOption = $tpl.clone().prop("id", "js-" + c).addClass("js-offers-currencies").text(currencies.labels[c]).show();
                $("#js-currency-picker").append($currencyOption);
                $currencyOption.click(function () {
                    changeCurrencySelection($(this).prop("id").split("-")[1]);
                });
            });
            $("#js-currency-picker").show();
        }
        doSelectCurrency(selectedCurrency);
    }

    function changeCurrencySelection(selectedCurrency) {
        doSelectCurrency(selectedCurrency);
        // update offers price display
        $(".js-offer").each(function () {
            var newPriceLabel = getLabelOfferPrice(g_offersByUid[$(this).prop("id")], g_currencies, selectedCurrency);
            $(this).find(".js-offer-price").hide("fast").text(newPriceLabel).show("fast");
        });
    }

    function doSelectCurrency(selectedCurrency) {
        currencies.allowed.forEach(function (c) {
            $("#js-" + c).addClass(c === selectedCurrency ? "font-weight-bold" : "text-body").removeClass(c === selectedCurrency ? "text-body" : "font-weight-bold");
            g_selectedCurrency = selectedCurrency;
        });
    }

    function displayCategoriesChoiceAndSelectOne() {
        var categoryKeys = Object.keys(g_categories);
        var $categoryTemplate = $("#offers-cat-tpl");
        var $offerCategoriesGrp = $("#js-category-picker-grp");
        var selectedCatId = null;
        categoryKeys.forEach(function (k, idx) {
            var $label = $categoryTemplate.clone().addClass("offers-cat").append(g_categories[k])
            var $input = $label.find("input");
            $input.prop("value", k);
            if (idx === 0) {
                selectedCatId = parseInt(k, 10);
                $input.prop("checked", true);
                $label.addClass("active");
            }
            $offerCategoriesGrp.append($label);
            $label.show();
        });
        $(".offers-cat>input").change(function () {
            onOfferCategorySelected(parseInt($(this).val(), 10));
        });
        if (categoryKeys.length > 1) $("#js-category-picker").show();
        return selectedCatId;
    }

    function showOffers(offers, template, selectedCatId, supportedCurrencies, selectedCurrency, ga) {
        for (var i = 0; i < offers.length; i++) {
            var offer = offers[i];
            g_offersByCode[offer.code] = offer; // TODO : needed?
            g_offersByUid[offer.uid] = offer;
            var $div = template.clone()
                .addClass("js-offer").addClass("cat-" + offer.catCode)
                .prop("id", offer.uid);
            var offerId = offer.code;
            $div.find("button").prop("id", offerId);
            $offersDiv.append($div); // TODO weird id?
            $div.find(".offer-value").text(getLabelDenomination(offer));
            $div.find(".js-offer-price").text(getLabelOfferPrice(offer, supportedCurrencies, selectedCurrency));
            if (offer.catCode === selectedCatId) $div.show();
            // prepare for eec: build impression lists and enrich offers with eec attributes
            if (typeof g_eecLists[offer.catCode] === 'undefined') g_eecLists[offer.catCode] = [offer.uid];
            else g_eecLists[offer.catCode].push(offer.uid);
            offer.eecId = ga[offer.uid].id;
            offer.eecName = ga[offer.uid].name;
        }
    }

}

function selectOffer(offerId) {
    g_selection.offerId = offerId; // TODO: needed?
    g_selectedOffer = getSelectedOffer();
    gtmEventByName("anOfferWasSelected");
    $("#phone-form,.js-clr-phone").hide();
    $("#confirm-country").text(g_selection.country.name);
    $("#confirm-phone").text("+" + g_selection.country.prefix + " " + $phoneInput.val());
    $("#confirm-value").text(getLabelDenomination(g_selectedOffer));

    var priceInSelectedCurrency = getAmountToPayLabel(g_selectedOffer, g_currencies, g_selectedCurrency);
    $("#js-confirm-price-selected").text(priceInSelectedCurrency);
    var additionalCurrencies = findOtherCurrenciesToDisplay(g_currencies, g_selectedCurrency, g_selectedOffer.denomination.currCode);
    if (additionalCurrencies.length > 0) {
        var label =
            additionalCurrencies.length === 1 ?
                getAmountToPayLabel(g_selectedOffer, g_currencies, additionalCurrencies[0]) :
                getAmountToPayLabel(g_selectedOffer, g_currencies, additionalCurrencies[0]) + " / " + getAmountToPayLabel(g_selectedOffer, g_currencies, additionalCurrencies[1]);
        $("#js-confirm-price-others").text("(" + label + ")");
    }

    if (Object.keys(g_categories).length > 1) {
        $("#confirm-product").text(g_categories[g_selectedOffer.catCode]);
        $("#summary-category").show();
    } else {
        $("#summary-category").hide();
    }
    $(".js-amount-to-pay").text(priceInSelectedCurrency);
    $("#summary-div, #payment-div").show();
    scrollTo("#summary-div");
    // notify GA EEC
    eecAddToCart(g_selectedOffer.uid);

    function findOtherCurrenciesToDisplay(supportedCurrencies, selectedCurrency, denominationCurrency) {
        if (selectedCurrency === "XOF") return denominationCurrency === "XOF" ? [] : [denominationCurrency];
        if (selectedCurrency === "EUR") return denominationCurrency === "XOF" ? ["XOF"] : [denominationCurrency, "XOF"];
        return ["EUR", "XOF"];
    }
}

function onOfferCategorySelected(selectedCatId) {
    Object.keys(g_categories).forEach(function (k) {
        if (parseInt(k, 10) === selectedCatId) $(".cat-" + k).show();
        else $(".cat-" + k).hide();
    });
    eecProductsList(g_eecLists[selectedCatId]);
}

function uiHideOffers() {
    $(".display-offers").hide();
    $("#title-offers-div").hide();
}

function getSelectedOffer() {
    var split = g_selection.offerId.split("|");
    var offerCode = split[split.length - 2] + "|" + split[split.length - 1];
    return g_offersByCode[offerCode];
}

// ====================================================================================================
// == SUMMARY
// ====================================================================================================

$("#js-change-offer").click(function () {
    $(".clr-page-2").hide();
    $offersBlockDiv.show();
    $("input[type=radio][name=payment]").prop("checked", false);
    gtmEventByName("clickChangeOfferBtn");
});

// ====================================================================================================
// == PAYMENT CHANNEL
// ====================================================================================================

$("input[name=payment][type=radio]").change(function () {
    selectPayChannel($("input[name=payment]:checked").val());
});

function selectPayChannel(channelCode) {
    if (channelCode) {
        dlPush({event: "selectPayChannel", payChannel: channelCode, amountXof: g_selectedOffer.xof});
        var $js = $(".js-payment-ctas");
        $js.hide("fast");
        $(".js-payment-cta-" + channelCode).show("fast");
        $(".js-payment-label-text").show();
        if (channelCode != PC_PP) {
            $(".js-payment-label-text-" + channelCode).hide();
        }
        g_selection.paymentChannel = parseInt(channelCode);
        dlPush({event: "showPayBtn", payChannel: channelCode, payProvider: g_pc_providers[channelCode]}); // what is the show btn event ?
        eecCheckoutPaymentChannel(g_pc_labels[channelCode], g_selectedOffer.uid);
    }
}

// ====================================================================================================
// == PAYMENT ACTION GENERIC
// ====================================================================================================

$(".js-payment-ctas").click(function () {
    if (g_fp[g_selection.paymentChannel] !== 1) processPayClick($(this));
});

function processPayClick($btn, fp) {
    var channelCode = g_selection.paymentChannel;
    dlPush({event: "clickPayBtn", payChannel: channelCode, payProvider: g_pc_providers[channelCode]});
    eecCheckoutClickPay(g_pc_labels[channelCode], g_selectedOffer.uid);
    if (channelCode === PC_OM && g_pc_providers[PC_OM] === 1) {
        uiHideOmCiErrorMsg();
        $("#omci-modal").modal("show");
        gtmEventByName("showOmCiModal");
    } else if (channelCode != PC_PP) {
        uiDisableAndSpin($btn);
        var buyRequest = buildBuyRequest(channelCode, (fp || null));
        $.redirect(g_ppUrls[g_pc_providers[channelCode]], buyRequest, "POST");
    }
}


function buildBuyRequest(channelCode, fp) {
    return {
        "offerUid": g_selectedOffer.uid,
        "paymentCurrencyCode": getActualPaymentCurrency(channelCode, g_selectedCurrency),
        "paymentChannelCode": channelCode,
        "fp": fp
    };

    function getActualPaymentCurrency(paymentChannel, selectedCurrency) {
        return g_effective_payment_currencies[paymentChannel][selectedCurrency] || g_effective_payment_currencies[paymentChannel]["*"];
    }
}

// ====================================================================================================
// == PAYPAL
// ====================================================================================================
function isPayPalActive() {
    return (typeof g_pc_labels !== "undefined") && g_pc_labels[PC_PP];
}

if (isPayPalActive()) {

    paypal.Marks().render('#js-paypal-marks-container');

    $(".paypal-mark").click(function () {
        eecCheckoutPaymentChannel(g_pc_labels[PC_PP], g_selectedOffer.uid);
    });

    paypal.Buttons({
        createOrder: function (data, actions) {
            return $.post("/api/tx/paypal/create-order", buildBuyRequest(PC_PP), function (orderID) {
                return orderID;
            });
        },
        onApprove: function (data, actions) {
            return $.post("/api/tx/paypal/authorize", {
                orderID: data.orderID
            }, function (atxPid) {
                if (atxPid) window.location.replace("/payment/success/" + PC_PP + "/" + atxPid)
                else window.alert("Payment failed"); // TODO ECH paypal
            });
        }
    }).render('#js-paypal-button-container');
}

// ====================================================================================================
// == PAYMENT ACTION OMPAY CI
// ====================================================================================================

$("#js-om-otp-btn").click(function () {
    dlPush({event: "omCi_SubmitOtp_Click"});
    uiHideOmCiErrorMsg();
    var payerPhone = cleanPhoneNumber($("#js-om-payer-phone").val());
    var payerOtp = $("#js-om-payer-otp").val().trim();
    var isValid = false;
    var msg = "";
    if (!isNaN(payerPhone) && payerPhone.length === 8) {
        if (!isNaN(payerOtp) && payerOtp.length === 4) {
            $("#omci-invalid").hide();
            isValid = true;
        } else msg = "Le code d'autorisation n'est pas valable (4 chiffres)";

    } else msg = "Le numéro de téléphone n'est pas valable (8 chiffres)";
    if (isValid) {
        var $btn = $(this);
        uiDisableAndSpin($btn);
        var pr = buildBuyRequest(PC_OM);
        pr.payerPhone = payerPhone;
        pr.payerOtp = payerOtp;
        $.post("/api/tx/ci/ompay/_execute", pr,
            function (res) {
                function processError(errorMsg, errrorEventName) {
                    uiShowOmCiErrorMsg(errorMsg);
                    dlPush({event: errrorEventName});
                    uiEndDisableAndSpin($btn);
                }

                if (res.paymentStatus === 0) {
                    g_paidMountEur = g_selectedOffer.eur;
                    gtmEventByName("omCi_PaymentSuccess");
                }

                if (typeof res.paymentStatus === 'undefined' && typeof res.airtimeSuccess === 'undefined') {
                    processError("Nous ne sommes pas parvenu à contacter Orange Money pour le paiement, merci de bien vouloir réessayer.", "omCi_SubmitOtp_InitFailed");
                } else if (typeof res.airtimeSuccess === 'undefined') {
                    processError(
                        "Le paiement a échoué, Orange Money a indiqué la raison suivante: "
                        + (res.paymentStatus === -5 ? "code d'autorisation incorrect" : res.omCiMsg)
                        + ".",
                        "omCi_SubmitOtp_PaymentFailed");
                } else if (res.airtimeSuccess === false) {
                    processError(
                        "Le paiement a fonctionné mais nous ne sommes pas encore parvenu à envoyer le crédit téléphonique: "
                        + "nous allons le renvoyer un peu plus tard, et vous contacter en cas de difficulté.",
                        "omCi_SubmitOtp_TransferFailed");
                } else if (res.airtimeSuccess === true) {
                    dlPush({event: "omCi_SubmitOtp_TransferSuccess"});
                    window.location.replace("/payment/success/om-ci-headless");
                }
            }
        );
    } else {
        dlPush({event: "omCi_SubmitOtp_InvalidInput"});
        uiShowOmCiErrorMsg(msg);
    }
});

function uiShowOmCiErrorMsg(msg) {
    $("#omci-error-msg").text(msg);
    $("#omci-error-alert").show();
}

function uiHideOmCiErrorMsg() {
    $("#omci-error-alert").hide();
}

function getLabelOfferPrice(offer, supportedCurrencies, selectedCurrency) {
    return offer.prices[selectedCurrency] / supportedCurrencies.multipliers[selectedCurrency] + " " + supportedCurrencies.labels[selectedCurrency];
}

function getLabelDenomination(offer) {
    var d = offer.denomination;
    return d.value + " " + d.currLbl;
}

function getAmountToPayLabel(o, supportedCurrencies, selectedCurrency) {
    var offer = o || getSelectedOffer();
    return getLabelOfferPrice(offer, supportedCurrencies, selectedCurrency);
}

// ====================================================================================================
// == UI UTILS
// ====================================================================================================

function scrollTo(eltSelector) {
    $("body, html").animate({scrollTop: $(eltSelector).offset().top});
}

function uiDisableAndSpin($btn) {
    $btn.find(".spinner-grow").show();
    $btn.prop("disabled", true);
}

function uiEndDisableAndSpin($btn) {
    $btn.find(".spinner-grow").hide();
    $btn.prop("disabled", false);
}

// ====================================================================================================
// == TRACKING
// ====================================================================================================

function gtmEventByName(en) {
    dlPush({event: en});
}

function eecProductsList(eecProducts) {
    dlPush({"event": "eec-impression", "ecommerce": {"currencyCode": "EUR", "impressions": eecProducts}});
}

function eecAddToCart(offerUid) {
    var products = [g_eec[offerUid]];
    dlPush({
        "event": "eec-product-click",
        "ecommerce": {"currencyCode": "EUR", "click": {"actionField": {"list": "offers"}, "products": products}}
    });
    dlPush({
        "event": "eec-detail",
        "ecommerce": {"currencyCode": "EUR", "detail": {"actionField": {"list": "offers"}, "products": products}}
    });
    dlPush({
        "event": "eec-add-to-cart",
        "ecommerce": {"currencyCode": "EUR", "add": {"products": products}}
    });
}

function eecCheckoutPaymentChannel(pcLabel, offerUid) {
    _eecCheckout(1, pcLabel, offerUid);
}

function eecCheckoutClickPay(pcLabel, offerUid) {
    _eecCheckout(2, pcLabel, offerUid);
}

function _eecCheckout(step, option, offerUid) {
    var eecProduct = g_eec[offerUid];
    eecProduct.quantity = 1;
    dlPush({
        "event": "eec-checkout",
        "ecommerce": {"checkout": {"actionField": {"step": step, "option": option}, "products": [eecProduct]}}
    });
}

// ====================================================================================================
// == UTILS
// ====================================================================================================

function poll(pollingUrl, polledAction, timeoutMs) {
    (function doPoll() {
        setTimeout(function () {
            $.ajax({
                url: pollingUrl, success: function (data) {
                    if (data.completed) polledAction(data.success);
                    else doPoll();
                }, dataType: "json"
            });
        }, timeoutMs);
    })();
}

function getCookie(name) {
    var value = "; " + document.cookie;
    var parts = value.split("; " + name + "=");
    if (parts.length == 2) return parts.pop().split(";").shift();
}

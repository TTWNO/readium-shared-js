//  Created by Boris Schneiderman.
//  Copyright (c) 2012-2013 The Readium Foundation.
//
//  The Readium SDK is free software: you can redistribute it and/or modify
//  it under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version.
//
//  This program is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU General Public License for more details.
//
//  You should have received a copy of the GNU General Public License
//  along with this program.  If not, see <http://www.gnu.org/licenses/>.

/*
 * View for rendering fixed layout page spread
 * @class ReadiumSDK.Views.FixedView
 */

ReadiumSDK.Views.FixedView = Backbone.View.extend({

    leftPageView: undefined,
    rightPageView: undefined,
    centerPageView: undefined,
    spine: undefined,
    spread: undefined,
    bookMargins: undefined,
    contentMetaSize: undefined,
    userStyles: undefined,

    $viewport: undefined,

    pageViews: [],

    initialize: function() {

        this.$viewport = this.options.$viewport;

        this.userStyles = this.options.userStyles;

        this.spine = this.options.spine;
        this.spread = new ReadiumSDK.Models.Spread(this.spine);

        this.leftPageView = new ReadiumSDK.Views.OnePageView({spine: this.spine, class: "fixed-page-frame-left", contentAlignment: "right"});
        this.rightPageView = new ReadiumSDK.Views.OnePageView({spine: this.spine, class: "fixed-page-frame-right", contentAlignment: "left"});
        this.centerPageView = new ReadiumSDK.Views.OnePageView({spine: this.spine, class: "fixed-page-frame-center", contentAlignment: "center"});

        this.pageViews.push(this.leftPageView);
        this.pageViews.push(this.rightPageView);
        this.pageViews.push(this.centerPageView);

        //event with namespace for clean unbinding
        $(window).on("resize.ReadiumSDK.readerView", _.bind(this.onViewportResize, this));
    },

    isReflowable: function() {
        return false;
    },

    render: function(){

        this.template = ReadiumSDK.Helpers.loadTemplate("fixed_book_frame", {});

        this.setElement(this.template);

        this.$viewport.append(this.$el);

        this.applyStyles();

        return this;
    },

    remove: function() {

        $(window).off("resize.ReadiumSDK.readerView");

        //base remove
        Backbone.View.prototype.remove.call(this);
    },

    setViewSettings: function(settings) {
        this.spread.setSyntheticSpread(settings.isSyntheticSpread);
    },

    redraw: function(initiator, paginationRequestElementId) {

        var self = this;

        var context = {isElementAdded : false};
        var pageLoadDeferrals = this.createPageLoadDeferrals([{pageView: this.leftPageView, spineItem: this.spread.leftItem, context: context},
                                                              {pageView: this.rightPageView, spineItem: this.spread.rightItem, context: context},
                                                              {pageView: this.centerPageView, spineItem: this.spread.centerItem, context: context}]);


        if(pageLoadDeferrals.length > 0) {
console.debug("1 pageLoadDeferrals.length > 0");
            $.when.apply($, pageLoadDeferrals).done(function(){
                if(context.isElementAdded) {
                    self.applyStyles();
                }
console.debug("2 pageLoadDeferrals GO!");
                self.onPagesLoaded(initiator, paginationRequestElementId)
            });
        }

    },

    applyStyles: function() {

        ReadiumSDK.Helpers.setStyles(this.userStyles.styles, this.$el.parent());

        this.updateBookMargins();
        this.updateContentMetaSize();
        this.resizeBook();
    },

    createPageLoadDeferrals: function(viewItemPairs) {

        var pageLoadDeferrals = [];

        for(var i = 0; i < viewItemPairs.length; i++) {

            var dfd = this.updatePageViewForItem(viewItemPairs[i].pageView, viewItemPairs[i].spineItem, viewItemPairs[i].context);
            if(dfd) {
                pageLoadDeferrals.push(dfd);
            }

        }

        return pageLoadDeferrals;

    },

    onPagesLoaded: function(initiator, paginationRequestElementId) {

        this.trigger(ReadiumSDK.Events.CONTENT_LOADED);

        this.updateContentMetaSize();
        this.resizeBook();

        this.trigger(ReadiumSDK.Events.CURRENT_VIEW_PAGINATION_CHANGED, { paginationInfo: this.getPaginationInfo(), initiator: initiator, elementId: paginationRequestElementId } );
    },

    onViewportResize: function() {

        this.resizeBook();
    },

    resizeBook: function() {

        if(!this.contentMetaSize || !this.bookMargins) {
            return;
        }

        var viewportWidth = this.$viewport.width();
        var viewportHeight = this.$viewport.height();

        if(!viewportWidth || !viewportHeight) {
            return;
        }

        var leftPageMargins = this.leftPageView.isDisplaying() ? ReadiumSDK.Helpers.Margins.fromElement(this.leftPageView.$el) : ReadiumSDK.Helpers.Margins.empty();
        var rightPageMargins = this.rightPageView.isDisplaying() ? ReadiumSDK.Helpers.Margins.fromElement(this.rightPageView.$el) : ReadiumSDK.Helpers.Margins.empty();
        var centerPageMargins = this.centerPageView.isDisplaying() ? ReadiumSDK.Helpers.Margins.fromElement(this.centerPageView.$el) : ReadiumSDK.Helpers.Margins.empty();

        var pageMargins = this.getMaxPageMargins(leftPageMargins, rightPageMargins, centerPageMargins);

        var potentialTargetElementSize = {   width: viewportWidth - this.bookMargins.width(),
                                             height: viewportHeight - this.bookMargins.height()};

        var potentialContentSize = {    width: potentialTargetElementSize.width - pageMargins.width(),
                                        height: potentialTargetElementSize.height - pageMargins.height() };

        if(potentialTargetElementSize.width <= 0 || potentialTargetElementSize.height <= 0) {
            return;
        }

        var horScale = potentialContentSize.width / this.contentMetaSize.width;
        var verScale = potentialContentSize.height / this.contentMetaSize.height;

        var scale = Math.min(horScale, verScale);

        var contentSize = { width: this.contentMetaSize.width * scale,
                            height: this.contentMetaSize.height * scale };

        var targetElementSize = {   width: contentSize.width + pageMargins.width(),
                                    height: contentSize.height + pageMargins.height() };

        var bookSize = {    width: targetElementSize.width + this.bookMargins.width(),
                            height: targetElementSize.height + this.bookMargins.height() };


        var bookLeft = Math.floor((viewportWidth - bookSize.width) / 2);
        var bookTop = Math.floor((viewportHeight - bookSize.height) / 2);

        if(bookLeft < 0) bookLeft = 0;
        if(bookTop < 0) bookTop = 0;

        this.$el.css("left", bookLeft + "px");
        this.$el.css("top", bookTop + "px");
        this.$el.css("width", targetElementSize.width + "px");
        this.$el.css("height", targetElementSize.height + "px");

        var left = this.bookMargins.padding.left;
        var top = this.bookMargins.padding.top;

        if(this.leftPageView.isDisplaying()) {

             this.leftPageView.transformContent(scale, left, top);
        }

        if(this.rightPageView.isDisplaying()) {

            left += this.contentMetaSize.separatorPosition * scale;

            if(this.leftPageView.isDisplaying()) {
                left += leftPageMargins.left;
            }

            this.rightPageView.transformContent(scale, left, top);
        }

        if(this.centerPageView.isDisplaying()) {

            this.centerPageView.transformContent(scale, left, top);
        }
    },

    getMaxPageMargins: function (leftPageMargins, rightPageMargins, centerPageMargins) {

         var sumMargin = {
            left: Math.max(leftPageMargins.margin.left, rightPageMargins.margin.left, centerPageMargins.margin.left),
            right: Math.max(leftPageMargins.margin.right, rightPageMargins.margin.right, centerPageMargins.margin.right),
            top: Math.max(leftPageMargins.margin.top, rightPageMargins.margin.top, centerPageMargins.margin.top),
            bottom: Math.max(leftPageMargins.margin.bottom, rightPageMargins.margin.bottom, centerPageMargins.margin.bottom)
        };

        var sumBorder = {
            left: Math.max(leftPageMargins.border.left, rightPageMargins.border.left, centerPageMargins.border.left),
            right: Math.max(leftPageMargins.border.right, rightPageMargins.border.right, centerPageMargins.border.right),
            top: Math.max(leftPageMargins.border.top, rightPageMargins.border.top, centerPageMargins.border.top),
            bottom: Math.max(leftPageMargins.border.bottom, rightPageMargins.border.bottom, centerPageMargins.border.bottom)
        };

        var sumPAdding = {
            left: Math.max(leftPageMargins.padding.left, rightPageMargins.padding.left, centerPageMargins.padding.left),
            right: Math.max(leftPageMargins.padding.right, rightPageMargins.padding.right, centerPageMargins.padding.right),
            top: Math.max(leftPageMargins.padding.top, rightPageMargins.padding.top, centerPageMargins.padding.top),
            bottom: Math.max(leftPageMargins.padding.bottom, rightPageMargins.padding.bottom, centerPageMargins.padding.bottom)
        };

        return new ReadiumSDK.Helpers.Margins(sumMargin, sumBorder, sumPAdding);

    },

    updateContentMetaSize: function() {

        this.contentMetaSize = {};

        if(this.centerPageView.isDisplaying()) {
            this.contentMetaSize.width = this.centerPageView.meta_size.width;
            this.contentMetaSize.height = this.centerPageView.meta_size.height;
            this.contentMetaSize.separatorPosition = 0;
        }
        else if(this.leftPageView.isDisplaying() && this.rightPageView.isDisplaying()) {
            if(this.leftPageView.meta_size.height == this.rightPageView.meta_size) {
                this.contentMetaSize.width = this.leftPageView.meta_size.width + this.rightPageView.meta_size.width;
                this.contentMetaSize.height = this.leftPageView.meta_size.height;
                this.contentMetaSize.separatorPosition = this.leftPageView.meta_size.width;
            }
            else {
                //normalize by height
                this.contentMetaSize.width = this.leftPageView.meta_size.width + this.rightPageView.meta_size.width * (this.leftPageView.meta_size.height / this.rightPageView.meta_size.height);
                this.contentMetaSize.height = this.leftPageView.meta_size.height;
                this.contentMetaSize.separatorPosition = this.leftPageView.meta_size.width;
            }
        }
        else if(this.leftPageView.isDisplaying()) {
            this.contentMetaSize.width = this.leftPageView.meta_size.width * 2;
            this.contentMetaSize.height = this.leftPageView.meta_size.height;
            this.contentMetaSize.separatorPosition = this.leftPageView.meta_size.width;
        }
        else if(this.rightPageView.isDisplaying()) {
            this.contentMetaSize.width = this.rightPageView.meta_size.width * 2;
            this.contentMetaSize.height = this.rightPageView.meta_size.height;
            this.contentMetaSize.separatorPosition = this.rightPageView.meta_size.width;
        }
        else {
            this.contentMetaSize = undefined;
        }

    },

    updateBookMargins: function() {
        this.bookMargins = ReadiumSDK.Helpers.Margins.fromElement(this.$el);
    },

    openPage: function(paginationRequest) {

        if(!paginationRequest.spineItem) {
            return;
        }

        this.spread.openItem(paginationRequest.spineItem);
        this.redraw(paginationRequest.initiator, paginationRequest.elementId);
    },


    openPagePrev: function(initiator) {

        this.spread.openPrev();
        this.redraw(initiator);
    },

    openPageNext: function(initiator) {

        this.spread.openNext();
        this.redraw(initiator);
    },

    updatePageViewForItem: function (pageView, item, context) {

        if(!item) {
            if(pageView.isDisplaying()) {
                pageView.remove();
            }
console.debug("deferral REMOVED");
            return undefined;
        }

        if(!pageView.isDisplaying()) {
            this.$el.append(pageView.render().$el);
            context.isElementAdded = true;
        }

        var dfd = $.Deferred();

        pageView.on(ReadiumSDK.Events.PAGE_LOADED, dfd.resolve);

        pageView.loadSpineItem(item);

console.debug("deferral PROMISE");
        return dfd.promise();

    },

    getPaginationInfo: function() {

        var paginationInfo = new ReadiumSDK.Models.CurrentPagesInfo(this.spine.items.length, this.spine.package.isFixedLayout(), this.spine.direction);

        var spreadItems = [this.spread.leftItem, this.spread.rightItem, this.spread.centerItem];

        for(var i = 0; i < spreadItems.length; i++) {

            var spreadItem = spreadItems[i];

            if(spreadItem) {
                paginationInfo.addOpenPage(0, 1, spreadItem.idref, spreadItem.index);
            }
        }

        return paginationInfo;
    },

    bookmarkCurrentPage: function() {

        var views = this.getDisplayingViews();

        if(views.length > 0) {

            var idref = views[0].currentSpineItem.idref;
            var cfi = views[0].getFirstVisibleElementCfi();

            if(cfi == undefined) {
                cfi = "";
            }

            return new ReadiumSDK.Models.BookmarkData(idref, cfi);
        }

        return new ReadiumSDK.Models.BookmarkData("", "");
    },

    getDisplayingViews: function() {

        var viewsToCheck = [];

        if( this.spine.isLeftToRight() ) {
            viewsToCheck = [this.leftPageView, this.centerPageView, this.rightPageView];
        }
        else {
            viewsToCheck = [this.rightPageView, this.centerPageView, this.leftPageView];
        }

        var views = [];

        for(var i = 0, count = viewsToCheck.length; i < count; i++) {
            if(viewsToCheck[i].isDisplaying()) {
                views.push(viewsToCheck[i]);
            }
        }

        return views;
    },

    getLoadedSpineItems: function() {

        return this.spread.validItems();
    },

    getElement: function(spineItem, selector) {

        var views = this.getDisplayingViews();

        for(var i = 0, count = views.length; i < count; i++) {

            var view = views[i];
            if(view.currentSpineItem == spineItem) {
                return view.getElement(spineItem, selector);
            }
        }

        console.error("spine item is not loaded");
        return undefined;
    },

    getVisibleMediaOverlayElements: function() {

        var elements = [];

        var views = this.getDisplayingViews();

        for(var i = 0, count = views.length; i < count; i++) {
            elements.push.apply(elements, views[i].getVisibleMediaOverlayElements());
        }

        return elements;
    },

    insureElementVisibility: function(element, initiator) {

        //for now we assume that for fixed layout element is always visible

    }

});
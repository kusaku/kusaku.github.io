/**
 * Created with JetBrains PhpStorm.
 * User: kusaku
 * Date: 29.04.13
 * Time: 20:15
 * To change this template use File | Settings | File Templates.
 */
(function () {

  /********************************************************
   * Kinetic.Html component (wrapper for html2canvas lib)
   *
   * Builds Kinetic node from given HTML DOM elements
   *
   * @namespace Kinetic
   * @extends Kinetic.Image
   ********************************************************/

  /**
   * Default configuration
   */

  var HTML_DEFAULT_CONFIG = {
    visible: false
  }

  /**
   * Kinetic.Html constructor
   * @param config
   * @constructor
   */
  Kinetic.Html = function (config) {
    if (typeof window.html2canvas != 'undefined') {
      this._initHtml(config);
    }
  };

  /**
   * Kinetic.Html class
   * @type {{_initHtml: Function, _preloaded: Function, _parsed: Function, _rendered: Function, _load: Function}}
   */
  Kinetic.Html.prototype = {
    _initHtml  : function (config) {
      var config = Base.prototype._complete(config, HTML_DEFAULT_CONFIG), that = this;

      // call super constructor
      // this may call this.setElements if config.elements is set
      Kinetic.Image.call(this, config);
      Kinetic.Eventable.call(this, config);

      this.nodeType = 'Html';
      this._isRendered = false;
    },
    _preloaded : function (images) {
      return true;
    },
    _parsed    : function (queue) {
      return true;
    },
    _rendered  : function (canvas) {
      this._isRendered = true;
      console.log('stopped render html', this.colorKey);
      $(this.attrs.elements).detach();
      var image = new Image(), that = this;
      image.onload = function () {
        that.show();
      }
      this.setImage(image);
      image.src = canvas.toDataURL();
    },
    render     : function () {
      console.log('started render html', this.colorKey);
      $(this.attrs.elements).appendTo('body');
      var that = this, config = {
        // general
              logging        : true,
        //background : 'transparent',
        background : 'red',

        // preload options
        //      proxy          : null,
        //      timeout        : 0,    // no timeout
              useCORS        : true, // try to load images as CORS (where available), before falling back to proxy
              allowTaint     : false, // whether to allow images to taint the canvas, won't need proxy if set to true

        // parse options
        //      svgRendering   : true, // use svg powered rendering where available (FF11+)
        //      ignoreElements : 'IFRAME|OBJECT|PARAM',
        //      useOverflow    : true,
        //      letterRendering: false,
        //      chinese        : false,

        // render options

        //      width    : null,
        //      height   : null,
        //      taintTest: true, // do a taint test with all images before applying to canvas
        renderer   : 'Canvas',
        onpreloaded: function (images) {
          that._preloaded.call(that, images);
        },
        onparsed   : function (queue) {
          that._parsed.call(that, queue);
        },
        onrendered : function (canvas) {
          that._rendered.call(that, canvas);
        }
      };
      html2canvas(this.attrs.elements, config);
    },
    show       : function () {
      if (this._isRendered) {
        this.setVisible(true);
      }
      else {
        this.render();
      }
    },
    setElements: function (elements) {
      this.hide();
      this._isRendered = false;
      this.attrs.elements = elements;
    }
  };

  Kinetic.Global.extend(Kinetic.Html, Kinetic.Image);

  /********************************************************
   * Kinetic.Button component
   *
   * Simple 32x32 button with callbacks
   *
   * @namespace Kinetic
   * @extends Kinetic.Rect
   * TODO refactor this
   * TODO make Kinetic.Sprite/Kinetic.Image as base class
   ********************************************************/

  /**
   * Default configuration
   */

  var BUTTON_DEFAULT_CONFIG = {
    width      : 32,
    height     : 32,
    fill       : '#800080',
    stroke     : '#FFFFFF',
    strokeWidth: 1,
    on         : {
      click    : function (evt) {
        evt.cancelBubble = true;
        console.log(this, 'clicked');
      },
      mouseover: function (evt) {
        evt.cancelBubble = true;
        this.setFill('#C000C0');
        this.getStage().getContainer().style.cursor = 'pointer';
      },
      mouseout : function (evt) {
        evt.cancelBubble = true;
        this.setFill('#800080');
        this.getStage().getContainer().style.cursor = 'default';
      }
    }
  }

  Kinetic.Button = function (config) {
    this._initButton(config);
  };

  Kinetic.Button.prototype = {
    _initButton: function (config) {
      var config = Base.prototype._complete(config, BUTTON_DEFAULT_CONFIG);

      // call super constructor
      Kinetic.Rect.call(this, config);
      Kinetic.Eventable.call(this, config);

      this.nodeType = 'Button';
    }
  };

  Kinetic.Global.extend(Kinetic.Button, Kinetic.Rect);

  /********************************************************
   * Kinetic.Card component
   *
   * Basic card, represents Actor node page with buttons
   *
   * @namespace Kinetic
   * @extends Kinetic.Traversable
   ********************************************************/

  /**
   * Default configuration
   */

  var CARD_DEFAULT_CONFIG = {
    width  : 300,
    height : 200,
    rect   : {
      width      : 300,
      height     : 200,
      fill       : '#0080FF',
      stroke     : '#FFFFFF',
      strokeWidth: 1,
      //    startScale   : 1,
      //      shadowColor  : 'black',
      //      shadowBlur   : 10,
      //      shadowOffset : [5, 5],
      //      shadowOpacity: 0.6
    },
    buttons: [],
    type   : 'rect',
    loaded : false
  }

  Kinetic.Card = function (config) {
    this._initCard(config);
  };

  Kinetic.Card.prototype = {
    _initCard: function (config) {
      var config = Base.prototype._complete(config, CARD_DEFAULT_CONFIG);

      // call super constructor
      Kinetic.Traversable.call(this, config);

      this.nodeType = 'Card';

      var content;

      switch (config.type) {
        case 'rect':
          content = new Kinetic.Rect(config.rect);
          break;
        case 'html':
          content = new Kinetic.Html({elements: config.elements});
          break;
        case 'text':
          // not implemented yet
          // content = ...
          break;
      }

      this.add(content);
    },
    getHtml  : function () {
      if (this.attrs.type == 'html') {
        return this.traverse.htmls[0].attrs.elements;
      }
    },
    show     : function () {
      if (this.attrs.type == 'html') {
        this.traverse.htmls[0].show();
      }
      Kinetic.Node.prototype.show.call(this);
    },
    getCached: function() {
      var config = this.getAbsolutePosition();
      config.width = this.getWidth();
      config.height = this.getHeight();
      config.callback = function(){};
      var image = this.toImage(config);
      console.log(image);
      return $(image);
    }
  };

  Kinetic.Global.extend(Kinetic.Card, Kinetic.Traversable);

  /********************************************************
   * Kinetic.Cardholder component
   *
   * Groups Actor's cards, shows html pop-up
   *
   * @namespace Kinetic
   * @extends Kinetic.Traversable
   ********************************************************/

  /**
   * Default configuration
   */

  var CARDHOLDER_DEFAULT_CONFIG = {
    displayState: 'collapsed'
  }

  Kinetic.Cardholder = function (config) {
    this._initCardholder(config);
  };

  Kinetic.Cardholder.prototype = {
    _initCardholder: function (config) {
      var config = Base.prototype._complete(config, CARDHOLDER_DEFAULT_CONFIG);

      // call super constructor
      Kinetic.Traversable.call(this, config);

      this.nodeType = 'Cardholder';
    },

    expandCards: function () {
      if (this.attrs.displayState == 'expanded') {
        return;
      }
      var that = this;
      var cards = this.traverse.cards;
      var offset = {x: (1 - cards.length) * 300, y: 0};
      for (var index = 0; index < cards.length; index++) {
        if (index != cards.length - 1) {
          cards[index].show();
        }

        cards[index].transitionTo({
                                    duration: 0.5,
                                    easing  : 'ease-in-out',
                                    offset  : offset,
                                    callback: function () {
                                      that.showHtml();
                                    }
                                  });
        //                cards[index].setOffset(offset.x, offset.y);
        offset.x += 300;
        offset.y = 0;
      }
      this.attrs.displayState = 'expanded';
    },

    //    joinCards: function () {
    //      var cards = this.traverse.cards;
    //      var offset = {x: (cards.length - 1) / 2 * 10, y: (cards.length - 1) / 2 * 10};
    //      for (var index = 0; index < cards.length; index++) {
    //        if (index > 0) {
    //          cards[index].show();
    //        }
    //        cards[index].transitionTo({
    //                                    duration: 0.5,
    //                                    easing  : 'ease-in-out',
    //                                    offset  : offset
    //                                  });
    //        //        cards[index].setOffset(offset.x, offset.y);
    //        offset.x -= 10;
    //        offset.y -= 10;
    //      }
    //      this.attrs.displayState = 'joined';
    //    },

    collapseCards: function () {
      if (this.attrs.displayState == 'collapsed') {
        return;
      }
      var cards = this.traverse.cards;
      var offset = {x: 0, y: 0};
      for (var index = 0; index < cards.length; index++) {
        if (index != cards.length - 1) {
          var card = cards[index];
          setTimeout(function () {
            card.hide();
          }, 500);
        }
        cards[index].transitionTo({
                                    duration: 0.5,
                                    easing  : 'ease-in-out',
                                    offset  : offset
                                  });
        //        cards[name].setOffset(offset.x, offset.y);
      }
      this.attrs.displayState = 'collapsed';
    },

    showHtml: function () {
      if (this.attrs.displayState == 'html') {
        return;
      }
      var that = this;
      var $popup = $('<div/>').attr('id', 'popup').append($('<div/>').css({
                                                                            'background-color': '#FFFFFF',
                                                                            'opacity'         : '0.9',
                                                                            'top'             : '0px',
                                                                            'left'            : '0px',
                                                                            'position'        : 'absolute',
                                                                            'width'           : '100%',
                                                                            'height'          : '100%'
                                                                          }).appendTo('body').one('click', function () {
                                                                                                    that.hideHtml();
                                                                                                  }));
      var cards = this.traverse.cards;

      var $container = $('<div/>').addClass('iosSlider');

      for (var index = 0; index < cards.length; index++) {
        var card = cards[index];
        if (card.attrs.type == 'html') {
//          var $html = $(card.getHtml()).clone();
          var $html = card.getCached();
          var pos = card.getAbsolutePosition();
          $html.css({'display': 'inline-block', 'margin-left': '-1px'}).addClass('slide');

          $html.data('cardIndex', index);
          $html.data('cardLastIndex', cards.length - 1);

          $html.one('click', function (event) {
            event.stopPropagation();
            that.swapCards($(this).data('cardIndex'), $(this).data('cardLastIndex'));
            that.hideHtml();
            return false;
          });

          $container.prepend($html);
        }
      }
      $container.wrapInner($('<div/>').addClass('slider'));
      $popup.append($container);
      $('body').append($popup);
      var pos = this.getAbsolutePosition();
      $container.iosSlider({snapToChildren   : true,
                             scrollbar       : true,
                             scrollbarHide   : false,
                             desktopClickDrag: true
//                             infiniteSlider  : true
                           });
      $container.css({'top': pos.y, 'left': pos.x, 'position': 'absolute'})
      this.attrs.displayState = 'html';
    },

    hideHtml: function () {
      $('#popup').remove();
      this.collapseCards();
    },

    //    toggleCards: function () {
    //      switch (this.attrs.displayState) {
    //        case 'collapsed':
    //          this.joinCards();
    //          break;
    //        case 'joined':
    //          this.expandCards();
    //          break;
    //        case 'expanded':
    //          this.showHtml();
    //          break;
    //        case 'html':
    //          this.joinCards();
    //          break;
    //      }
    //    },

    swapCards: function (index1, index2) {
      var card1 = this.traverse.cards[index1], card2 = this.traverse.cards[index2];
      var zIndex1 = card1.getZIndex(), zIndex2 = card2.getZIndex();
      this.traverse.cards[index2] = card1;
      this.traverse.cards[index1] = card2;
      card1.setZIndex(zIndex2);
      card2.setZIndex(zIndex1);
      this.draw();
    }
  };

  Kinetic.Global.extend(Kinetic.Cardholder, Kinetic.Traversable);

  /********************************************************
   * Kinetic.Actor component
   *
   * Represents Actor node with relations to other Actors
   *
   * @namespace Kinetic
   * @extends Kinetic.Draggable, Kinetic.Relative
   ********************************************************/

  /**
   * Default configuration
   */

  var ACTOR_DEFAULT_CONFIG = {
    width : 300,
    height: 200,
    on    : {
      click: function (evt) {
        if (this.attrs.justDragged) {
          this.attrs.justDragged = false;
        }
        else {
          this.traverse.cardholders[0].expandCards();
        }
      },
      //      mouseover: function (evt) {
      //        evt.cancelBubble = false;
      //        if (this.attrs.displayState != 'expanded' || this.attrs.displayState != 'html') {
      //          this.joinCards();
      //        }
      //      },
      //      mouseout : function (evt) {
      //        evt.cancelBubble = false;
      //        if (this.attrs.displayState != 'expanded' || this.attrs.displayState != 'html') {
      //          this.collapseCards();
      //        }
      //      }
    }
  }

  Kinetic.Actor = function (config) {
    this._initActor(config);
  };

  Kinetic.Actor.prototype = {
    _initActor: function (config) {
      var config = Base.prototype._complete(config, ACTOR_DEFAULT_CONFIG);
      // call super constructor
      Kinetic.Draggable.call(this, config);
      Kinetic.Relative.call(this, config);

      this.nodeType = 'Actor';
    }
  };

  Kinetic.Global.extend(Kinetic.Actor, Kinetic.Draggable);
  Kinetic.Global.extend(Kinetic.Actor, Kinetic.Relative);

})();


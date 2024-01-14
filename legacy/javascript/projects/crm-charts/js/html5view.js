/**
 * Created with JetBrains PhpStorm.
 * User: kusaku
 * Date: 30.04.13
 * Time: 17:37
 * To change this template use File | Settings | File Templates.
 */
(function (undefined) {
  /**
   *  Html5view class
   *
   *  Builds canvas stage with layers
   *  Mantains Actor nodes
   *
   *  @namespace Global
   *  @extends Base
   */
  window.Html5view = (function () {
    // constructor
    function Html5view(container) {
      container = container || 'body';
      this._init(container);
    }

    // members
    Html5view.prototype = {
      nodes    : {},
      nodeViews: {},
      _init    : function (container) {
        var that = this;

        this.container = $(container);

        this.stage = new Kinetic.Stage({
                                         container: this.container.get(0),
                                         width    : this.container.width(),
                                         height   : this.container.height(),
                                         draggable: true
                                       });

        this.drawLayer = new Kinetic.Layer({
                                             width : this.container.width(),
                                             height: this.container.height(),
                                             id    : 'drawLayer'
                                           });

        this.dragLayer = new Kinetic.Layer({
                                             width : this.container.width(),
                                             height: this.container.height(),
                                             id    : 'dragLayer'
                                           });

        this.viewLayer = new Kinetic.Layer({
                                             width : this.container.width(),
                                             height: this.container.height(),
                                             id    : 'viewLayer'
                                           });

        this.stage.add(this.drawLayer);
        this.stage.add(this.dragLayer);
        this.stage.add(this.viewLayer);

        this.zoom = 1;

        $(window).bind('resize', function () {
          that.stage.setHeight(that.container.height());
          that.stage.setWidth(that.container.width());
        });

        this.container.bind('mousewheel', function (event, delta) {
          if (delta > 0) {
            that.zoom *= 1.1;
          }
          else {
            that.zoom /= 1.1;
          }

          var width = that.stage.getWidth();
          var height = that.stage.getHeight();
          //    var offset = layer.getOffset();

          var config = {
            //      x     : event.pageX,
            //      y     : event.pageY,
            scale : {
              x: that.zoom,
              y: that.zoom
            },
            offset: {
              x: (1 - 1 / that.zoom) * width / 2,
              y: (1 - 1 / that.zoom) * height / 2
            }
          };

          that.drawLayer.setAttrs(config);
          that.dragLayer.setAttrs(config);

          that.drawLayer.draw();
          that.dragLayer.draw();

          return false;
        });
      },

      generateCardHtml: function (card) {

        var $element = $('<div/>').css({
                                         'display'         : 'block',
                                         'position'        : 'absolute',
                                         'padding'         : '8px',
                                         'height'          : '184px',
                                         'width'           : '284px',
                                         'color'           : '#FFFFFF',
                                         'background-color': '#0080FF',
                                         'border'          : '1px solid #FFFFFF',
                                         'overflow'        : 'auto'
                                       });

        //        if (!this._isEmpty(card.image)) {
        //          $('<img/>').attr('src', card.image.src).attr('title', card.image.title).css({
        //                                                                                        'float'  : 'left',
        //                                                                                        'padding': '0 5px 5px 0'
        //                                                                                      }).appendTo($element);
        //        }

        if (!this._isEmpty(card.title)) {
          $('<h1>').text(card.title).css({
                                           'font-size': '18px',
                                           'padding'  : '0',
                                           'margin'   : '0'
                                         }).appendTo($element);
        }

        if (!this._isEmpty(card.attributes)) {
          $('<div/>').text('Title').css({
                                          'float'           : 'left',
                                          'width'           : '100px',
                                          'border-right'    : '1px solid #FFFFFF',
                                          'padding-right'   : '4px',
                                          'margin-right'    : '10px',
                                          'lineheight'      : '12px',
                                          'font-size'       : '10px',
                                          'background-color': '#0080FF',
                                          'overflow'        : 'hidden',
                                          'font-weight'     : 'bold'
                                        }).appendTo($element);

          $('<div/>').text('Value').css({
                                          'lineheight'      : '12px',
                                          'font-size'       : '10px',
                                          'background-color': '#0080FF',
                                          'overflow'        : 'hidden',
                                          'font-weight'     : 'bold'
                                        }).appendTo($element);

          for (var i = 0; i < card.attributes.length; i++) {
            var attibute = card.attributes[i];
            $('<div/>').text((attibute.title || '') + ':').css({
                                                                 'float'           : 'left',
                                                                 'width'           : '100px',
                                                                 'border-right'    : '1px solid #FFFFFF',
                                                                 'padding-right'   : '4px',
                                                                 'margin-right'    : '10px',
                                                                 'lineheight'      : '12px',
                                                                 'font-size'       : '10px',
                                                                 'background-color': '#0080FF',
                                                                 'overflow'        : 'hidden'
                                                               }).appendTo($element);

            $('<div/>').text(attibute.value || '').css({
                                                         'lineheight'      : '12px',
                                                         'font-size'       : '10px',
                                                         'background-color': '#0080FF',
                                                         'overflow'        : 'hidden'
                                                       }).appendTo($element);

          }
        }

        $element.appendTo('body');

        return $element;

      },

      generateCard: function (card) {
        var $html = this.generateCardHtml(card);
        return new Kinetic.Card({
                                  type    : 'html',
                                  elements: $html.get(0)
                                });

      },

      generateCardHtml2: function (page) {
        var type = page.getType();

        // div 300x200 px
        var $element = $('<div/>').css({
                                         'display'         : 'block',
                                         'padding'         : '8px',
                                         'height'          : '184px',
                                         'width'           : '284px',
                                         'color'           : '#FFFFFF',
                                         'background-color': type == 'main' ? '#004080' : '#0080FF',
                                         'border'          : '1px solid #FFFFFF',
                                         'overflow'        : 'auto'
                                       });

        if (!this._isEmpty(page.getTitle())) {
          $('<h1>').text(page.getTitle()).css({
                                                'font-size': '18px',
                                                'padding'  : '0',
                                                'margin'   : '0'
                                              }).appendTo($element);
        }

        if (!this._isEmpty(page.getImage())) {
          $('<img/>').attr('src', page.getImage()).css({
                                                         'float'  : 'left',
                                                         'padding': '0 5px 5px 0'
                                                       }).appendTo($element);
        }

        // template switch - page type

        switch (type) {
          case 'main':
            var $container = $('<div/>').css({'overflow': 'auto'});

            for (var i = 0; i < page.getAttributesCount(); i++) {
              var attibute = page.getAttribute(i);
              $('<div/>').text((attibute.getTitle() || '') + ':').css({
                                                                        'float'      : 'left',
                                                                        'width'      : '100px',
                                                                        'overflow'   : 'hidden',
                                                                        'lineheight' : '14px',
                                                                        'font-size'  : '12px',
                                                                        'font-weight': 'bold'
                                                                      }).appendTo($container);

              $('<div/>').text(attibute.getValue() || '').css({
                                                                'float'      : 'right',
                                                                'width'      : '100px',
                                                                'overflow'   : 'hidden',
                                                                'lineheight' : '14px',
                                                                'font-size'  : '12px',
                                                                'font-weight': 'bold'

                                                              }).appendTo($container);

            }
            $element.append($container);
            break;
          case 'secondary':
            var $container = $('<div/>').css({'overflow': 'auto'}).append($('<div/>').text('Title').css({
                                                                                                          'float'        : 'left',
                                                                                                          'width'        : '100px',
                                                                                                          'padding-right': '4px',
                                                                                                          'margin-right' : '10px',
                                                                                                          'lineheight'   : '12px',
                                                                                                          'font-size'    : '10px',
                                                                                                          'overflow'     : 'hidden',
                                                                                                          'font-weight'  : 'bold'
                                                                                                        })).append(

                $('<div/>').text('Value').css({
                                                'lineheight' : '12px',
                                                'font-size'  : '10px',
                                                'overflow'   : 'hidden',
                                                'font-weight': 'bold'
                                              }).appendTo($element));

            for (var i = 0; i < page.getAttributesCount(); i++) {
              var attibute = page.getAttribute(i);
              $('<div/>').text((attibute.getTitle() || '') + ':').css({
                                                                        'float'        : 'left',
                                                                        'width'        : '100px',
                                                                        'border-right' : '1px solid #FFFFFF',
                                                                        'padding-right': '4px',
                                                                        'margin-right' : '10px',
                                                                        'lineheight'   : '12px',
                                                                        'font-size'    : '10px',
                                                                        'overflow'     : 'hidden'
                                                                      }).appendTo($container);

              $('<div/>').text(attibute.getValue() || '').css({
                                                                'lineheight': '12px',
                                                                'font-size' : '10px',
                                                                'overflow'  : 'hidden'
                                                              }).appendTo($container);

            }
            $element.append($container);
            break;
          case 'text':
            $('<p/>').text(page.getText()).css({
                                                 'padding'  : '5px 0',
                                                 'font-size': '12px'
                                               }).appendTo($element);
            break;
        }

        return $element;

      },

      generateCard2: function (page) {
        var $html = this.generateCardHtml2(page);
        return new Kinetic.Card({
                                  type    : 'html',
                                  elements: $html.get(0)
                                });

      },

      addComponents: function (components, node) {
        for (var key in components) {
          switch (key) {
            case 'cards':
              var node_id = node.id;
              var nodeView = this.nodeViews[node_id];

              var cards = components[key], cardholder;

              if (nodeView.traverse.cardholders) {
                cardholder = nodeView.traverse.cardholders[0];
              }
              else {
                cardholder = new Kinetic.Cardholder();
                nodeView.add(cardholder);
              }

              for (var i = 0, card = cards[i]; i < cards.length; i++, card = cards[i]) {
                if (this._isEmpty(card)) {
                  continue;
                }
                cardholder.add(this.generateCard(card));
                node.cards.push(card);
              }
              break;
            case 'relations':
              // not implemented yet
              break;
          }
        }
      },

      removeComponent: function (components, node) {
        for (var key in components) {
          switch (key) {
            case 'cards':
              var node_id = node.id;
              var nodeView = this.nodeViews[node_id]
              var cards = components[key];
              var cardholder = nodeView.traverse.cardholders[0];

              for (var i = 0, card = cards[i]; i < cards.length; i++, card = cards[i]) {
                if (this._isEmpty(card)) {
                  continue;
                }
                node.cards.pop();
                var last = cardholder.traverse.cards[cardholder.traverse.cards.length - 1];
                last.destroy();
              }
              break;
            case 'relations':
              // not implemented yet
              break;
          }
        }
      },

      updateNode: function (oldNode, newNode) {
        //  diff is expensive for view, so detach
        var node_id = oldNode.id;
        var nodeView = this.nodeViews[node_id]
        var diff = this._diff(oldNode, newNode);

        if (!this._isEmpty(diff.left)) {
          this.removeComponent(diff.left, oldNode);
        }

        if (!this._isEmpty(diff.right)) {
          this.addComponents(diff.right, oldNode);
        }

        nodeView.draw();

        return oldNode;
      },

      addNode: function (newNode) {
        var node_id = newNode.id;
        if (node_id in this.nodes) {
          throw 'Node ' + node_id + ' is already in view.';
        }

        var oldNode = this.nodes[node_id] = {id: node_id, cards: []};
        var nodeView = this.nodeViews[node_id] = new Kinetic.Actor();

        this.drawLayer.add(nodeView);

        return this.updateNode(oldNode, newNode);
      },

      removeNode: function (newNode) {
        var node_id = newNode.id;
        if (!(node_id in this.nodes)) {
          throw 'Node ' + node_id + ' is not in view.';
        }
        else {
          this.nodeViews[node_id].destroy();
          delete this.nodes[node_id];
          delete this.nodeViews[node_id];
        }
      },

      applyChanges: function (list) {
        for (var i = 0; i < list.length; i++) {
          var item = list[i];
          switch (item.changeType) {
            case 'addNode':

              var node = item.node;
              var node_id = node.getId();

              if (node_id in this.nodes) {
                throw 'Node ' + node_id + ' is already in view.';
              }

              var nodeView = new Kinetic.Actor({x: node.x, y: node.y});
              var cardholder = new Kinetic.Cardholder();

              var currentPage = node.getCurrentPage();

              for (var k = 0; k < node.getPagesCount(); k++) {
                var page = node.getPage(k);
                if (page !== currentPage) {
                  var card = this.generateCard2(page);
                  cardholder.add(card);
                }
              }
              var currentCard = this.generateCard2(currentPage);

              cardholder.add(currentCard);
              nodeView.add(cardholder);
              this.drawLayer.add(nodeView);

              currentCard.show();
              nodeView.draw();

              this.nodes[node_id] = node;
              this.nodeViews[node_id] = nodeView;

              break;
            case 'updateNode':
              // huh???
              break;
            case 'removeNode':
              break;
          }
        }
        // timout due to html2canvas generation
        var that = this;
        setTimeout(function () {
          that.drawLayer.draw()
        }, 1000);
      }
    }

    // Html5view "extends" Base
    Base.prototype._extend(Html5view, Base);

    return Html5view;

  })();

})();

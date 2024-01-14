$(function () {

  var view = new Html5view('#container');

  /**
   * nodeList
   * @see mockup-generator.js
   */
  view.applyChanges(nodeList);

  /**
   * test data
   */


  var cardTemplate1 = {
    id        : 'main',
    image     : {
      src  : '/img/logo.png',
      title: 'Just image'
    },
    title     : 'General info',
    attributes: [
      {'title': 'First name', 'value': 'Ivan'},
      {'title': 'Last name', 'value': 'Ivanoff'},
      {'title': 'Phone', 'value': '+3 254 254-25-78'}
    ]
  }

  var cardTemplate2 = {
    id        : 'second',
    image     : {
      src  : '/img/logo.png',
      title: 'Just image'
    },
    title     : 'Secondary info',
    attributes: [
      {'title': 'First name', 'value': 'Petr'},
      {'title': 'Last name', 'value': 'Petroff'},
      {'title': 'Phone', 'value': '+3 333 222-55-77'}
    ]
  };


  window.nodes = [];
  window.lastNode = null;

  $('<button/>').text('add new node').appendTo('body').css({
                                                             'z-index' : '99999',
                                                             'position': 'absolute',
                                                             'top'     : '5px',
                                                             'left'    : '5px'
                                                           }).click(function (event) {
                                                                      event.stopPropagation();

                                                                      var node = {
                                                                        id   : 'id' + window.nodes.length,
                                                                        cards: [cardTemplate1]
                                                                      };

                                                                      var addedNode = view.addNode(node);

                                                                      window.nodes.push(addedNode);
                                                                      window.lastNode = addedNode;

                                                                      return false;
                                                                    });

  $('<button/>').text('add card to last node').appendTo('body').css({
                                                                      'z-index' : '99999',
                                                                      'position': 'absolute',
                                                                      'top'     : '35px',
                                                                      'left'    : '5px'
                                                                    }).click(function (event) {
                                                                               event.stopPropagation();
                                                                               if (!window.lastNode) {
                                                                                 return;
                                                                               }

                                                                               // copy node
                                                                               node = Base.prototype._clone(window.lastNode)
                                                                               // copy array
                                                                               node.cards = node.cards.slice();
                                                                               node.cards.push(cardTemplate2);

                                                                               window.lastNode = view.updateNode(window.lastNode, node);

                                                                               //var nodeView = view.nodeViews[node.id];
                                                                               //nodeView.traverse.cardholders[0].joinCards();

                                                                               return false;
                                                                             });

  $('<button/>').text('delete card from last node').appendTo('body').css({
                                                                           'z-index' : '99999',
                                                                           'position': 'absolute',
                                                                           'top'     : '65px',
                                                                           'left'    : '5px'
                                                                         }).click(function (event) {
                                                                                    event.stopPropagation();
                                                                                    if (!window.lastNode) {
                                                                                      return;
                                                                                    }

                                                                                    // copy node
                                                                                    node = Base.prototype._clone(window.lastNode)
                                                                                    // copy array
                                                                                    node.cards = node.cards.slice();

                                                                                    node.cards.pop();

                                                                                    window.lastNode = view.updateNode(window.lastNode, node);

                                                                                    //var nodeView = view.nodeViews[node.id];
                                                                                    //nodeView.traverse.cardholders[0].joinCards();

                                                                                    return false;
                                                                                  });

  $('<button/>').text('swapCards').appendTo('body').css({
                                                          'z-index' : '99999',
                                                          'position': 'absolute',
                                                          'top'     : '95px',
                                                          'left'    : '5px'
                                                        }).click(function (event) {
                                                                   event.stopPropagation();
                                                                   if (!window.lastNode) {
                                                                     return;
                                                                   }

                                                                   window.lastNode.view.traverse.cardholders[0].swapCards(0, 1);

                                                                   return false;
                                                                 });

  $('<button/>').text('delete last node').appendTo('body').css({
                                                                 'z-index' : '99999',
                                                                 'position': 'absolute',
                                                                 'top'     : '125px',
                                                                 'left'    : '5px'
                                                               }).click(function (event) {
                                                                          event.stopPropagation();
                                                                          if (!window.lastNode) {
                                                                            return;
                                                                          }

                                                                          view.removeNode(window.lastNode);

                                                                          window.lastNode = window.nodes.pop();

                                                                          return false;
                                                                        });

  /**
   * end of test data
   */



  $('button').hide();

});




/**
 * Created with JetBrains PhpStorm.
 * User: kusaku
 * Date: 15.05.13
 * Time: 13:22
 * To change this template use File | Settings | File Templates.
 */

/**
 *  @namespace Global
 */

var nodeAttrubute = function (title, value) {
  this._title = title;
  this._value = value;
};

nodeAttrubute.prototype = {
  getTitle: function () {
    return this._title;
  },
  getValue: function () {
    return this._value;
  }
};

var nodePage = function (id, type, title, data, image) {
  this._id = id;
  this._type = type;
  this._title = title;
  if (Base.prototype._isArray(data)) {
    this._attrubutes = data;
    this._text = '';
  }
  else {
    this._attrubutes = [];
    this._text = data;
  }
  this._image = image;
}

nodePage.prototype = {
  getType           : function () {
    return this._type;
  },
  getTitle          : function () {
    return this._title;
  },
  getAttributes     : function () {
    return this._attrubutes;
  },
  getAttributesCount: function () {
    return this._attrubutes.length;
  },
  getAttribute      : function (i) {
    return this._attrubutes[i];
  },
  getText           : function () {
    return this._text;
  },
  getImage          : function () {
    return this._image;
  },
  getText           : function () {
    return this._text;
  }
}

var nodeTemplate = function (id, currentPage, pages, pos) {
  this._id = id;
  this._currentPage = currentPage;
  this._pages = pages;
  this.x = pos.x;
  this.y = pos.y;
};

nodeTemplate.prototype = {
  getId         : function () {
    return this._id;
  },
  getPage       : function (i) {
    return this._pages[i];
  },
  getCurrentPage: function () {
    return this.getPage(this._currentPage);
  },
  getPagesCount : function () {
    return this._pages.length;
  }
}

/**
 * Mock text generator
 * @param count
 * @param length
 * @returns {*}
 */
function mockText(count, length) {
  var vowels = new Array('a', 'e', 'i', 'o', 'y', 'u', 'oo', 'ee', 'er', 'ea', 'or', 'ur');
  var consonants = new Array('b', 'c', 'dr', 'pr', 'st', 'bl', 'cr', 'ks', 'ph', 'h', 'sh', 'ch', 'kh', 'x', 'k');
  var result = '';

  var count = arguments[0] ? Math.random() * arguments[0] + 1 : 1;
  for (var i = 0; i < count; i++) {
    var length = arguments[1] ? Math.random() * arguments[1] + 1 : Math.random() * 4 + 1;
    for (var k = 0; k < length; k++) {
      result += consonants[Math.floor(Math.random() * consonants.length)] + vowels[Math.floor(Math.random() * vowels.length)];
    }
    result += ' ';
  }

  return Kinetic.Type._capitalize(result);
}

var nodeList = [];
var pageTypes = ['main', 'secondary', 'text'];
//var pageTypes = ['secondary'];

var TOTAL = 5, ROWS = 5

for (var i = 0; i < TOTAL; i++) {
  // clone node template;
  var pages = [];

  pageCount = Math.floor(Math.random() * 5 + 2);

  for (var k = 0; k < pageCount; k++) {
    // force main on 0
    var pageType = (k == 0) ? 'main' : pageTypes[Math.floor(Math.random() * pageTypes.length)];
    var image = k % 2 == 1 ? null : '/img/logo.png';
    switch (pageType) {
      case 'main':
        var attrubuteCount = Math.floor(Math.random() * 7 + 1);
        var attrubutes = [];
        for (var l = 0; l < attrubuteCount; l++) {
          attrubutes.push(new nodeAttrubute(mockText(0, 2), mockText(0, 3)));
        }
        pages.push(new nodePage('page_' + k, 'main', mockText(0, 3), attrubutes, image));
        break;
      case 'secondary':
        var attrubuteCount = Math.floor(Math.random() * 9 + 1);
        var attrubutes = [];
        for (var l = 0; l < attrubuteCount; l++) {
          attrubutes.push(new nodeAttrubute(mockText(0, 2), mockText(0, 3)));
        }
        pages.push(new nodePage('page_' + k, 'secondary', mockText(0, 3), attrubutes, image));
        break;
      case 'text':
        pages.push(new nodePage('page_' + k, 'text', mockText(0, 3), mockText(10, 3), image));
        break;
    }
  }

  var node = new nodeTemplate('node_' + i, 0, pages, {x: 15 + (i % ROWS) * (300 + 15), y: 15 + Math.floor(i / ROWS) * (200 + 15)});

  nodeList.push({changeType: 'addNode', node: node});
}

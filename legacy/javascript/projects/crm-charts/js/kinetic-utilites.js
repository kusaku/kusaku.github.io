/**
 * Created with JetBrains PhpStorm.
 * User: kusaku
 * Date: 16.05.13
 * Time: 17:05
 * To change this template use File | Settings | File Templates.
 */

/**
 * Utility classes
 */

(function (undefined) {
  /**
   *  Base utility class
   *  @namespace GLobal
   */

  window.Base = (function () {
    // constructor
    function Base() {
    }

    Base.prototype = {

      _isFunction: function (obj) {
        return !!(obj && obj.constructor && obj.call && obj.apply);
      },
      _isObject  : function (obj) {
        return (!!obj && obj.constructor == Object);
      },
      _isArray   : function (obj) {
        return Object.prototype.toString.call(obj) == '[object Array]';
      },
      _isNumber  : function (obj) {
        return Object.prototype.toString.call(obj) == '[object Number]';
      },
      _isString  : function (obj) {
        return Object.prototype.toString.call(obj) == '[object String]';
      },
      _isEmpty   : function (obj) {
        if (this._isArray(obj)) {
          if (obj.length == 0) {
            return true;
          }
          for (var i = 0; i < obj.length; i++) {
            if (!this._isEmpty(obj[i])) {
              return false;
            }
          }
          return true;
        }
        if (this._isObject(obj)) {
          if (Object.keys(obj).length == 0) {
            return true;
          }
          for (var key in obj) {
            if (!this._isEmpty(obj[key])) {
              return false;
            }
          }
          return true;
        }
        return !obj;
      },
      // c1 extends c2
      _extend    : function (c1, c2) {
        c1.prototype.__super__ = c2;
        for (var key in c2.prototype) {
          if (!( key in c1.prototype)) {
            c1.prototype[key] = c2.prototype[key];
          }
        }
      },
      // deep clone
      _clone     : function (obj, depth) {
        var retObj = {};
        if ((depth = depth || 0) > 20) {
          return retObj;
        }
        for (var key in obj) {
          if (this._isObject(obj[key])) {
            retObj[key] = this._clone(obj[key], ++depth);
          }
          else {
            retObj[key] = obj[key];
          }
        }
        return retObj;
      },
      // o1 takes precedence over o2
      _merge     : function (o1, o2) {
        var retObj = this._clone(o2);
        for (var key in o1) {
          if (this._isObject(o1[key])) {
            retObj[key] = this._merge(o1[key], retObj[key]);
          }
          else {
            retObj[key] = o1[key];
          }
        }
        return retObj;
      },
      // o2 deep completes o1
      _complete  : function (o1, o2) {
        o1 = o1 || {};
        for (var key in o2) {
          if (this._isObject(o2[key])) {
            o1[key] = this._complete(o1[key], o2[key]);
          }
          else if (o1[key] === undefined) {
            o1[key] = o2[key];
          }
        }
        return o1;
      },
      // o1 o2 difference
      _diff      : function (o1, o2, merged) {
        var retObj, diff, length;
        if (this._isObject(o1) && this._isObject(o2)) {
          retObj = {left: {}, right: {}};
          if (merged === undefined) {
            merged = this._merge(o1, o2);
          }
          for (var key in merged) {
            if (this._isFunction(merged[key])) {
              continue;
            }
            diff = this._diff(o1[key], o2[key], merged[key]);
            if (diff.left !== undefined) {
              retObj.left[key] = diff.left;
            }
            if (diff.right !== undefined) {
              retObj.right[key] = diff.right;
            }
          }
        }
        else if (this._isArray(o1) && this._isArray(o2)) {
          retObj = {left: [], right: []};
          length = Math.max(o1.length, o2.length);
          for (var i = 0; i < length; i++) {
            diff = this._diff(o1[i], o2[i]);
            if (diff.left !== undefined) {
              retObj.left.push(diff.left);
            }
            if (diff.right !== undefined) {
              retObj.right.push(diff.right);
            }
          }
        }
        else {
          if (o1 === o2) {
            retObj = {left: undefined, right: undefined};
          }
          else {
            retObj = {left: o1, right: o2};
          }
        }
        return retObj;
      }
    }

    return Base;

  })();

  /********************************************************
   * Kinetic.Eventable extension component
   * @namespace Kinetic
   ********************************************************/

  Kinetic.Eventable = function (config) {
    if ('on' in config) {
      for (var name in config.on) {
        this.on(name, config.on[name]);
        delete config.on[name];
      }
    }
  };

  Kinetic.Global.extend(Kinetic.Eventable, Kinetic.Node);

  /********************************************************
   * Kinetic.Traversable extension component
   ********************************************************/

  Kinetic.Traversable = function (config) {
    this.createAttrs();
    // call super constructor
    Kinetic.Container.call(this, config);
    this.nodeType = 'Traversable';
    this.traverse = {};
  };

  Kinetic.Traversable.prototype = {
    add: function (child) {
      var type = child.nodeType.toLowerCase() + 's';
      if (!(type in this.traverse)) {
        this.traverse[type] = [];
      }

      var traverse = this.traverse[type];

      // override remove()
      child.remove = function () {
        var index = traverse.indexOf(child);
        traverse.splice(index, 1);
        return child.__proto__.remove.call(child);
      };

      // store child by type
      traverse.push(child);

      // chainable, call super
      return Kinetic.Container.prototype.add.call(this, child)
    }
  };

  Kinetic.Global.extend(Kinetic.Traversable, Kinetic.Container);

  /********************************************************
   * Kinetic.Draggable extension component
   *
   *
   *
   * @namespace Kinetic
   ********************************************************/

  /**
   * Default configuration
   */

  var DRAGGABLE_DEFAULT_CONFIG = {
    draggable  : true,
    justDragged: false,
    // TODO: make this jQuery-aware
    on         : {
      'mouseover': function (evt) {
        this.moveToTop();
        this.draw();
        this.getStage().getContainer().style.cursor = 'move';
      },
      'mouseout' : function (evt) {
        this.getStage().getContainer().style.cursor = 'default';
      },
      'dragstart': function (evt) {
        evt.cancelBubble = true;
        var dragLayer = this.getStage().get('#dragLayer')[0];
        this.moveTo(dragLayer);
        this.getStage().draw();
        this.startDrag();
      },
      'dragend'  : function (evt) {
        evt.cancelBubble = true;
        var drawLayer = this.getStage().get('#drawLayer')[0];
        this.moveTo(drawLayer);
        this.getStage().draw();
        this.attrs.justDragged = true;
      }
    }
  };

  // constructor
  Kinetic.Draggable = function (config) {
    var config = Base.prototype._complete(config, DRAGGABLE_DEFAULT_CONFIG);
    // call super constructor
    Kinetic.Traversable.call(this, config);
    Kinetic.Eventable.call(this, config);
  };

  Kinetic.Global.extend(Kinetic.Draggable, Kinetic.Traversable);

})();

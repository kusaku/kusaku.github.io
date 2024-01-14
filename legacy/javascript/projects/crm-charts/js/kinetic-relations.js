/**
 * Created with JetBrains PhpStorm.
 * User: kusaku
 * Date: 13.05.13
 * Time: 16:36
 * To change this template use File | Settings | File Templates.
 */

(function () {

  /********************************************************
   * Kinetic.Relative component
   *
   * Implements behavior for relation-connected nodes
   *
   * @namespace Kinetic
   * @extends Kinetic.Eventable
   ********************************************************/

  /**
   * Default configuration
   */

  var RELATIVE_DEFAULT_CONFIG = {
    relations: [],
    //    vizualizer: Kinetic.Relation,
    on       : {
      'dragmove': function (evt) {
        //        console.log(this._id +  ' moving ' + this.relations.length + ' relations');
        for (var i = 0; i < this.relations.length; i++) {
          this.relations[i]._calculatePoints();
        }
      },
      'dragend' : function (evt) {
        this.attrs.newRelated = null;
        for (var i = 0; i < this.relatable.length; i++) {
          var related = this.relatable[i];
          if (this === related) {
            continue;
          }
          if (this._inresects(related)) {
            this.attrs.newRelated = related;
          }
        }
      },
      'mouseup' : function (evt) {
        if (Kinetic.Type._isObject(this.attrs.newRelated)) {
          var related = this.attrs.newRelated, pos = this._getRelativePosition(related);
          switch (pos) {
            case 'ad':
              related.addRelationTo(this, 'horizontal');
              break;
            case 'bc':
              this.addRelationTo(related, 'horizontal');
              break;
            case 'ac':
              this.addRelationTo(related, 'vertical');
              break;
            case 'bd':
              related.addRelationTo(this, 'vertical');
              break;
          }
          this.attrs.newRelated = null;
        }
      }
    }
  };

  Kinetic.Relative = function (config) {
    this._initRelative(config);
  }

  Kinetic.Relative.prototype = {
    relatable           : [],
    _initRelative       : function (config) {
      var config = Base.prototype._complete(config, RELATIVE_DEFAULT_CONFIG);
      // call super constructor
      Kinetic.Eventable.call(this, config);
      this.relations = [];
      this.relatable.push(this);
      // initialize
      for (var i = 0; i < config.relations.length; i++) {
        this.addRelationTo(config.relations[i]);
      }
    },
    _getRelativePosition: function (node) {
      var tan = node.attrs.height / node.attrs.width;
      var pos = '';
      pos += (this.attrs.x - node.attrs.x) * tan > (this.attrs.y - node.attrs.y) ? 'a' : 'b';
      pos += (this.attrs.x - node.attrs.x) * tan < (node.attrs.y - this.attrs.y) ? 'c' : 'd';
      return pos;
    },
    _isInside           : function (point, node) {
      return point.x >= node.attrs.x && point.x <= node.attrs.x + node.attrs.width && point.y >= node.attrs.y && point.y <= node.attrs.y + node.attrs.height;
    },
    _inresects          : function (node) {
      return this.attrs.x < node.attrs.x + node.attrs.width && // left edge
             this.attrs.x + this.attrs.width > node.attrs.x && // right edge
             this.attrs.y < node.attrs.y + node.attrs.height && // top edge
             this.attrs.y + this.attrs.height > node.attrs.y; // bottom edge
    },
    addRelationTo       : function (node, type) {
      //      console.log(node);
      type = type || 'horizontal';
      var relation = new Kinetic.Relation({type: type}, this, node);
      this.relations.push(relation);
      if (Kinetic.Type._isArray(node.relations)) {
        node.relations.push(relation);
      }
      var layer = this.getLayer();
      layer.add(relation).draw();
    },
    removeRelationTo    : function (node) {
      for (var i = 0; i < this.relations.length; i++) {
        if (node === this.relations[i].end) {
          this.relations[i].remove();
          console.log('relation removed');
        }
      }
    },
    remove              : function () {
      var index = this.relatable.indexOf(this);
      this.relatable.splice(index, 1);
      console.log(24234234);
      Kinetic.Node.prototype.remove.call(this);
    }
  }

  /********************************************************
   * Kinetic.Relation component
   *
   * Mantains and draws relatinon (horizontal/vertical)
   *
   * @namespace Kinetic
   * @extends Kinetic.Line
   * TODO add icons/button container
   ********************************************************/

  /**
   * Default configuration
   */

  var RELATION_DEFAULT_CONFIG = {
    //'horizontal', 'vertical'
    type       : 'horizontal',
    strokeWidth: 5,
    lineCap    : 'round',
    lineJoin   : 'round',
    buttons    : {
      addAnoterRelation: {
        width : 32,
        height: 32,
        fill  : '#000080',
        on    : {
          'click'    : function (evt) {
            evt.cancelBubble = true;
            this.relation.start.addRelationTo(this.relation.end, this.relation.attrs.type == 'horizontal' ? 'vertical' : 'horizontal');
            this.getLayer().draw();
          },
          'mouseover': function (evt) {
            evt.cancelBubble = true;
            this.setFill('#0000A0');
            this.getStage().getContainer().style.cursor = 'pointer';
            this.draw()
          },
          'mouseout' : function (evt) {
            evt.cancelBubble = true;
            this.setFill('#000080');
            this.getStage().getContainer().style.cursor = 'default';
            this.draw()
          }
        }
      },
      removeRelation   : {
        width : 32,
        height: 32,
        fill  : '#800000',
        on    : {
          'click'    : function (evt) {
            evt.cancelBubble = true;
            this.off('mouseover mouseout');
            this.relation.destroy();
          },
          'mouseover': function (evt) {
            //            console.log(this);
            evt.cancelBubble = true;
            this.setFill('#A00000');
            this.getStage().getContainer().style.cursor = 'pointer';
            this.draw()
          },
          'mouseout' : function (evt) {
            evt.cancelBubble = true;
            this.setFill('#800000');
            this.getStage().getContainer().style.cursor = 'default';
            this.draw()
          }
        }
      }
    }
  };

  Kinetic.Relation = function (config, start, end) {
    this._initRelation(config, start, end);
  };

  Kinetic.Relation.prototype = {
    _initRelation   : function (config, start, end) {
      var config = Base.prototype._complete(config, RELATION_DEFAULT_CONFIG);
      // call super constructor
      Kinetic.Line.call(this, config);
      this.nodeType = 'Relation';
      this.setStroke(config.type == 'horizontal' ? 'gold' : 'red');

      this.start = start;
      this.end = end;
      var that = this;

      // override
      start.remove = function () {
        console.log('start remove call!!!');
        // remove relation
        that.remove();
        // original remove()
        return start.__proto__.remove.call(start);
      }

      // override
      end.remove = function () {
        console.log('end remove call!!!');
        // remove relation
        that.remove();
        // original remove()
        return end.__proto__.remove.call(end);
      }

      this.buttons = [];

      for (name in config.buttons) {
        var button = new Kinetic.Button(config.buttons[name]);
        // store relation
        button.relation = this;
        // XXX buttons added to end node layer, this.getLayer() in not set yet
        end.getLayer().add(button);
        this.buttons.push(button);
      }

      this._calculatePoints();
    },
    _calculatePoints: function () {
      var start = Base.prototype._complete(this.start.getPosition(), this.start.getSize());
      var end = Base.prototype._complete(this.end.getPosition(), this.end.getSize());

      // swap start / end
      if (this.attrs.type == 'horizontal' && start.x > end.x /*|| this.attrs.type == 'vertical' && start.y > end.y*/) {
        var tmp = start;
        start = end;
        end = tmp;
      }

      var center, points = [];
      if (this.attrs.type == 'horizontal') {
        center = {x: (start.x + start.width + end.x) / 2, y: (start.y + end.y + (start.height + end.height) / 2) / 2};
        points.push({x: start.x + start.width, y: start.y + start.height / 2});
        points.push({x: start.x + start.width + 10, y: start.y + start.height / 2});
        points.push({x: start.x + start.width + 10, y: center.y});
        points.push({x: center.x, y: center.y});
        points.push({x: end.x - 10, y: center.y});
        points.push({x: end.x - 10, y: end.y + end.height / 2});
        points.push({x: end.x, y: end.y + end.height / 2});
      }
      else {
        center = {x: (start.x + end.x + (start.width + end.width) / 2) / 2, y: (start.y + start.height + end.y) / 2};
        points.push({x: start.x + start.width / 2, y: start.y + start.height});
        points.push({x: start.x + start.width / 2, y: start.y + start.height + 10});
        points.push({x: center.x, y: start.y + start.height + 10});
        points.push({x: center.x, y: center.y});
        points.push({x: center.x, y: end.y - 10});
        points.push({x: end.x + end.width / 2, y: end.y - 10});
        points.push({x: end.x + end.width / 2, y: end.y});
      }

      this.setPoints(points);

      for (var i = 0; i < this.buttons.length; i++) {
        this.buttons[i].setPosition(center);
        if (this.attrs.type == 'horizontal') {
          this.buttons[i].setOffset((i - (this.buttons.length - 1) / 2) * 40 + 16, 36)
        }
        else {
          this.buttons[i].setOffset((i - (this.buttons.length - 1) / 2) * 40 + 16, -4)
        }
        this.buttons[i].moveToTop();
      }
    },
    remove          : function () {
      if (Kinetic.Type._isArray(this.start.relations)) {
        var index = this.start.relations.indexOf(this);
        this.start.relations.splice(index, 1);
        console.log('relation in start deleted');
      }
      if (Kinetic.Type._isArray(this.end.relations)) {
        var index = this.end.relations.indexOf(this);
        this.end.relations.splice(index, 1);
        console.log('relation in end deleted');
      }
      for (var i = 0; i < this.buttons.length; i++) {
        this.buttons[i].remove();
      }
      var layer = this.getLayer();
      Kinetic.Line.prototype.remove.call(this);
      layer.draw();
    },
  };

  Kinetic.Global.extend(Kinetic.Relation, Kinetic.Line);

})();






function CollectionFactory(Base, Singleton) {
  /**
  Base model that represents multiple objects.
  @class Collection
  @extends Base
  @prop {number}  length         - Number of known items in the instance
  @prop {boolean} $busy          - If instance is currently in the middle of an API call, equals `true`; else `false`
  @prop {boolean} $loaded        - If instance has been loaded or instantiated with data, equals `true`; else `false`
  @prop {array}   $selected      - Array of selected items
  @prop {number}  $selectedCount - Count of items that are currently selected
  @prop {boolean} $allSelected   - If all known items in the instance are selected, equals `true`; else `false`
  @prop {boolean} $noneSelected  - If none of the items in the instance are selected, equals `true`; else `false`
  @prop {string}  $type          - The type of model the instance is
  */
  var Collection = function() {};

  var reSortExpression = /^\s+([+-]?)(.*)\s+$/;

  function evalSelected() {
    /*jshint validthis:true */
    var self = this;
    self.$allSelected = false;
    self.$noneSelected = true;
    if (self.$selectedCount === self.length && self.length > 0) {
      self.$allSelected = true;
    }
    if (self.$selectedCount > 0) {
      self.$noneSelected = false;
    }
  }

  function getValue(field, obj) {
    var val,
        f;
    if (m_isString(field) && field.length > 0) {
      field = field.split('.');
      while (field.length > 0) {
        f = field.shift();
        if (m_isFunction(obj[f]) === true) {
          val = obj[f]();
        } else if (m_isObject(val) === false) {
          return undefined;
        } else {
          val = obj[f];
        }
      }
      return val;
    }
    return undefined;
  }

  /**
  @typedef ChildModel
  @type {Singleton}
  @prop {Collection} $parent - Link to the parent instance of the child (eg; the Collection instance)
  */
  /**
  Marks the child model as selected
  @name ChildModel.select
  @type function
  @arg {boolean} value - The value to set the selection to
  @arg {boolean} [forBulk] - Passing `true` will prevent re-evaluation of the selected state of the Collection instance (used for bulk selections)
  @returns {ChildModel} `this`
  */

  /**
   * Define constructor
   */
  Collection = Base.extend(
    /** @lends Collection.prototype */
    {
      $type: 'Collection',
      /**
      The model to use when retrieving child objects.
      @type {Singleton}
      */
      childModel: Singleton,
      /**
      Instantiates the Collection.
      @override
      */
      init: function (data, forClone) {
        /*jshint unused:false */
        var self = this._super.apply(this, arguments);

        self.$$data = data || [];
        self.$$addData = [];
        self.length = self.$$data.length;
        self.$loaded = self.length > 0;
        self.$$origData = null;
        self.$selected = [];
        self.$selectedCount = 0;
        self.$allSelected = false;
        self.$noneSelected = true;
        self.$busy = false;
      },
      /**
      Triggers `cb` for each current child in the instance.
      @arg {Collection~eachCB} cb - Method to call for each child
      @returns {Collection} `this`
      */
      /**
      Callback for Collection.each.
      @callback Collection~eachCB
      @param data - The child object
      @param {number} index - Index position of the child in the current data for the instance
      @this {Singleton} `this`
      */
      each: function (cb) {
        var self = this;
        if (m_isFunction(cb) === true) {
          m_forEach(self.get(), cb);
        }
        return self;
      },
      /**
      Triggers `cb` for each current child in the instance and returns the resulting array.
      @arg {Collection~mapCB} cb - Method to call for each child
      @returns {Array} Result of the map opperation
      */
      /**
      Callback for Collection.map.
      @callback Collection~mapCB
      @param data - The child object
      @param {number} index - Index position of the child in the current data for the instance.
      @this {Singleton} `this`
      */
      map: function (cb) {
        if (m_isFunction(cb) === true) {
          return map(this.get(), cb);
        }
        return [];
      },
      /**
      Method to retrieve all the current data for the instance.
      @returns {ChildModel[]}
      */
      get: function () {
        var self = this;
        if ( self.$$modeled ) {
          return self.$$modeled;
        }
        self.$$modeled = new Array(self.length);
        m_forEach(self.$$data, function (obj, i) {
          var ret;
          if (obj instanceof self.childModel) {
            ret = obj;
          } else {
            ret = new self.childModel(obj);
            ret.resolve();
          }
          ret.$parent = self;
          ret.select = function (value, forBulk) {
            this.$selected = value;
            self.$selected[i] = value;
            /*jshint -W030 */
            value ? self.$selectedCount++ : self.$selectedCount--;
            if (forBulk !== true) {
              evalSelected.call(self);
            }
            return this;
          };
          self.$$modeled[i] = ret;
        });
        return self.$$modeled;
      },
      /**
      Method to retrieve specific fields from all the current data for the instance.
      @returns {Object[]}
      */
      pluck: function (fields) {
        var self = this,
            ret = new Array(self.length);
        if (m_isArray(fields) === false) {
          fields = [fields];
        }
        self.each(function (child, idx) {
          m_forEach(fields, function (f) {
            if (m_isFunction(child[f])) {
              ret[idx] = ret[idx] || {};
              ret[idx][f] = child[f]();
            }
          });
        });
        return ret;
      },
      /**
      Method to set the data for the instance. Also sets `this.$loaded = true`. Will re-apply any sorting/filtering after setting the data.
      @arg {array} val - The data to set on the instance
      @returns {Collection} `this`
      */
      set: function (val) {
        var self = this.end(true);
        self.$$data = val;
        self.length = self.$$data.length;
        self.$loaded = self.$loaded || self.length > 0;
        self.$$modeled = null;
        if (self.$$filter) {
          self.filter(self.$$filter);
        }
        if (self.$$sort) {
          self.sort(self.$$sort);
        }
        return self;
      },
      /**
      Creates one or more linked ChildModels, but does not add them into the current data.
      @arg {undefined|null|ChildModel|object|Collection|array} val - The pending data to set on the instance
      @returns {ChildModel|Collection|array} `val`
      */
      add: function (obj) {
        var self = this,
            ret = [];
        if (m_isUndefined(obj) || obj === null) {
          ret.push({});
        } else if (obj instanceof self.childModel) {
          ret.push(obj);
        } else if (obj instanceof Singleton) {
          ret.push(obj.get());
        } else if (obj instanceof Collection) {
          ret = ret.concat(obj.get());
        } else if (m_isArray(obj) === true) {
          m_forEach(obj, function (i, val) {
            ret.push(val);
          });
        } else if (m_isObject(obj) === true) {
          ret.push(obj);
        } else {
          throw new Error('Invalid object added to Collection: ' + obj);
        }
        m_forEach(ret, function (obj, i) {
          if ((obj instanceof self.childModel) === false) {
            if (obj instanceof Singleton) {
              obj = obj.get();
            }
            obj = new self.childModel(obj);
            obj.$parent = self;
            obj.select = function (value, forBulk) {
              this.$selected = value;
              self.$selected[i] = value;
              /*jshint -W030 */
              value ? self.$selectedCount++ : self.$selectedCount--;
              if (forBulk !== true) {
                evalSelected.call(self);
              }
            };
            ret[i] = obj;
          }
        });
        self.$$addData = ret;
        if (obj instanceof Collection || m_isArray(obj) === true) {
          return ret;
        } else {
          return ret[0];
        }
      },
      /**
      Adds any linked ChildModels into the current data.
      @returns {Collection} `this`
      */
      finalize: function (data) {
        var self = this;
        if ( self.$$addData.length > 0 ) {
          self.set(self.$$data.concat(self.$$addData));
          self.$$addData = [];
          self.$loaded = false;
          self.trigger('finalized', data);
        }
        return self;
      },
      filter: function (_filter) {
        var self = this,
            newData = [];
        if (self.$$data.length > 0) {
          if (m_isFunction(_filter) === true) {
            self.$$filter = _filter;
            self.$$origData = self.$$origData || m_copy(self.$$data);
            self.$$data = filter(self.get(), _filter);
            self.length = self.$$data.length;
            self.$$modeled = null;
          } else if (m_isObject(_filter) === true) {
            if (objectKeys(_filter).length > 0) {
              self.$$filter = _filter;
              self.$$origData = self.$$origData || m_copy(self.$$data);
              filter(self.get(), function (val) {
                var ret = true;
                pick(_filter, function (v, k) {
                  var value;
                  if (m_isFunction(val[k]) === true) {
                    value = val[k]();
                  } else {
                    value = val[k];
                  }
                  if (m_isArray(value) === true) {
                    ret = ret && value.indexOf(v) > -1;
                  } else {
                    ret = ret && m_equals(value, v);
                  }
                  if (ret === false) {
                    val.select(false);
                    return ret;
                  }
                });
                if (ret === true) {
                  newData.push(val.get());
                }
              });
              self.$$data = newData;
              self.length = self.$$data.length;
              self.$$modeled = null;
              evalSelected.call(self);
            }
          } else {
            throw new Error('Invalid filter value provided: ' + filter);
          }
        } else {
          self.$$filter = _filter;
        }
        return self;
      },
      sort: function (sort, preserveCase) {
        var self = this,
            len, sf;

        function compare(f, descending) {
          var field  = f;
          if (m_isFunction(f) === false) {
            f = function (a, b) {
              a = getValue(field, a);
              b = getValue(field, b);
              if (m_isObject(a)) {
                a = JSON.stringify(a);
              }
              if (m_isObject(b)) {
                b = JSON.stringify(b);
              }
              if (preserveCase !== true) {
                a = ('' + a).toLowerCase();
                b = ('' + b).toLowerCase();
              }
              if (descending) {
                return a > b ? -1 : a < b ? 1 : 0;
              }
              return a > b ? 1 : a < b ? -1 : 0;
            };
          }
          return f;
        }
        function baseF(f, descending) {
          f = compare(f, descending);
          f.next = function (y, d) {
            var x = this;
            y = compare(y, d);
            return baseF(function (a, b) {
              return x(a, b) || y(a, b);
            });
          };
          return f;
        }

        if (self.length > 0) {
          if (m_isString(sort) === true) {
            sort = sort.split();
          }
          if (m_isFunction(sort) === true) {
            self.$$sort = sort;
            self.$$origData = self.$$origData || m_copy(self.$$data);
            self.$$modeled = self.get().sort(sort);
          } else if (m_isArray(sort) === true && sort.length > 0) {
            self.$$origData = self.$$origData || m_copy(self.$$data);
            len = sort.reverse().length;
            while (--len) {
              sort[len] = sort[len].exec(reSortExpression);
              if (sort[len].length !== 3) {
                throw new Error('Invalid sort value provided: ' + sort[len]);
              }
              if (sf) {
                sf.next(sort[len][2], (sort[len][1] === '-' ? true : false));
              } else {
                sf = baseF(sort[len][2], (sort[len][1] === '-' ? true : false));
              }
            }
            self.$$modeled = self.get().sort(sf);
          } else {
            throw new Error('Invalid sort value provided: ' + sort);
          }
          self.$$data = new Array(self.length);
          self.each(function (item, idx) {
            self.$$data[idx] = item.get();
          });
        } else {
          self.$$sort = sort;
        }
        return self;
      },
      end: function (keepHistory) {
        var self = this;
        if (self.$$origData !== null) {
          self.select(false);
          self.$$data = m_copy(self.$$origData);
          self.$$addData = [];
          self.$$modeled = null;
          self.length = self.$$data.length;
          self.$$origData = null;
          if (keepHistory !== true) {
            delete self.$$sort;
            delete self.$$filter;
          }
        }
        return self;
      },
      unique: function (field) {
        var self = this,
            uniques = {},
            ret = [];
        if (m_isString(field) && field.length > 0) {
          self.each(function (item) {
            var val = getValue(field, item);
            if (m_isArray(val) === true) {
              m_forEach(val, function(v) {
                if (m_isObject(v) === true) {
                  v = JSON.stringify(v);
                }
                if (uniques[v.toString()] === undefined) {
                  uniques[v.toString()] = true;
                  ret.push(v);
                }
              });
            } else  {
              if (m_isObject(val) === true) {
                val = JSON.stringify(val);
              }
              debugger;
              if (val !== null && val !== undefined && uniques[val.toString()] === undefined) {
                uniques[val.toString()] = true;
                ret.push(val);
              }
            }
          });
        }
        return ret;
      },
      select: function (index, value) {
        var self = this;
        if (index === true) {
          self.$selected = new Array(self.length);
          self.$selectedCount = 0;
          self.each(function (item) {
            item.select(true, true);
          });
        } else if (index === false) {
          self.each(function (item) {
            item.select(false, true);
          });
          self.$selected = [];
          self.$selectedCount = 0;
        } else if (m_isNumber(index) === true) {
          self.get()[index].select(value);
        }
        evalSelected.call(self);
        return self;
      },
      clone: function () {
        var self = this,
            ret = self._super.apply(self, arguments);
        ret.$$data = m_copy(self.$$data);
        ret.$$addData = m_copy(self.$$addData);
        ret.$$origData = m_copy(self.$$origData);
        ret.length = self.length;
        ret.$loaded = ret.$loaded;
        ret.$selected = self.$selected;
        ret.$selectedCount = self.$selectedCount;
        ret.$allSelected = self.$allSelected;
        ret.$noneSelected = self.$noneSelected;
        return ret;
      },

      /**
      Re-runs the last `read` call or, if never called, calls `read`.
      @returns {Collection} `this`
      */
      refresh: function () {
        var self = this;
        if (self.$$lastReadData) {
          return self.read(self.$$lastReadData);
        }
        return self.read();
      },

      /**
      Success callback passed into a service.
      @arg data - The data resulting from a sucessful service call
      @callback Collection~successCallback
      */
      /**
      Fail callback passed into a service.
      @arg data - The data resulting from an erroring service call
      @callback Collection~failCallback
      */
      /**
      Service to read (GET) the data for this instance. Services should return `false` if they are currently invalid.
      @arg data - Data to be used during the read
      @arg {Collection~successCallback} Success callback for the service
      @arg {Collection~failCallback} Failure callback for the service
      @abstract
      @returns {boolean}
      */
      readService: false,
      /**
      Uses the readService (if defined) to attempt to retrieve the data for the instance. Will finalize the instance.
      @arg [data] - Data to be provided to the readService
      @returns {Collection} `this`
      */
      read: function (data, idx) {
        var self = this,
            ret;

        if (self.$busy === true) {
          self.always(function() {
            self.read(data, idx);
          });
          idx = self.unfinalize();
          return self;
        } else {
          idx = idx || self.unfinalize();
        }

        if (m_isFunction(self.readService)) {
          self.$busy = true;
          self.$$lastReadData = data || {};
          ret = self.readService(
            data,
            function (data) {
              delete self.$errors.read;
              self.set(data);
              self.resolve(idx);
            },
            function (data) {
              self.$errors.read = data;
              self.reject(idx);
            }
          );
          if (ret === false) {
            self.$errors.read = true;
            self.reject(idx);
          }
        }
        return self;
      },
      /**
      Service to update (PUT) the data for this instance. Services should return `false` if they are currently invalid.
      @arg data - Data to be used during the update
      @arg {Collection~successCallback} Success callback for the service
      @arg {Collection~failCallback} Failure callback for the service
      @abstract
      @returns {boolean}
      */
      updateService: false,
      /**
      Uses the updateService (if defined) to attempt to update the current data for the instance. Will finalize the instance upon success.
      @arg [data] - Data to be provided to the updateService
      @returns {Collection} `this`
      */
      update: function (data, idx) {
        var self = this,
            ret;

        if (self.$busy === true) {
          self.always(function() {
            self.update(data, idx);
          });
          idx = self.unfinalize();
          return self;
        } else {
          idx = idx || self.unfinalize();
        }

        if (m_isFunction(self.updateService)) {
          self.$busy = true;
          if (arguments.length === 0) {
            delete self.$errors.update;
            return self.resolve(idx);
          }
          ret = self.updateService(
            data,
            function (data) {
              delete self.$errors.update;
              self.resolve(idx);
            },
            function (data) {
              self.$errors.update = data;
              self.reject(idx);
            }
          );
          if (ret === false) {
            self.$errors.update = true;
            self.reject(idx);
          }
        } else {
          self.$errors.update = true;
          self.reject(idx);
        }
        return self;
      },
    }
  );

  /**
   * Return the constructor function
   */
  return Collection;
}

angular.module( 'angular-m' )
  .factory( 'Collection', [ 'Base', 'Singleton', CollectionFactory ] );

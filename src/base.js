function BaseFactory() {
  /*jshint strict:false */
  var initializing = false,
      // Need to check which version of function.toString we have
      superPattern = /xy/.test(function () {return 'xy';}) ? /\b_super\b/ : /.*/;

  function executeQueue(idx, data) {
    var self = this,
        i = 0;
    for(; i < self.$$cbQueue.length; i++) {
      if (self.$$cbQueue[i].idx <= idx) {
        if (
          (self.$$cbQueue[i].type < 3 && self.$$finals[idx] && self.$$finals[idx].resolved === true) || // Success (type=1) & Always (type=2)
          (self.$$cbQueue[i].type > 1 && self.$$cbQueue[i].type < 4 && self.$$finals[idx] && self.$$finals[idx].rejected === true) || // Fail (type=3) & Always (type=2)
          (self.$$cbQueue[i].type === 4 && (!self.$$finals[idx] || (!self.$$finals[idx].resolved && !self.$$finals[idx].rejected))) // Progress (type=4)
        ) {
          self.$$cbQueue[i].cb.call(self, data);
        }
        // If this thread is resolved or rejected, then remove the cb from the queue to keep executions faster
        if (self.$$finals[idx].resolved || self.$$finals[idx].rejected) {
          self.$$cbQueue.splice(i, 1);
          i--;
        }
      }
    }
  }

  /**
  Event that triggers when the source model is cloned
  @event Base#cloned
  @prop {Base} clone - The new instance that was created as a result of the clone
  */
  /**
  Event that triggers when the model is resolved (generally when data is loaded succesfully)
  @event Base#resolved
  */
  /**
  Event that triggers when the model is rejected (generally when a data load fails)
  @event Base#rejected
  */
  /**
  Event that triggers when the model is notified (progress is recorded)
  @event Base#notified
  */
  /**
  Event that triggers when the model is finalized (resolved or rejected)
  @event Base#finalized
  */
  /**
  Event that triggers when the model is unfinalized (reset back to being neither resolved nor rejected)
  @event Base#unfinalized
  */

	/**
  Base model that all other models will inherit from. Provides Promises/A functionality as well as publish/subscribe functionality.
  @constructs Base
  @prop {Object}  $errors       - Contains details about any error states on the instance
  */
  function Base() {}

  Base.prototype = {
    $type: 'Base',
    /**
    Initialization method. Called automatically when a new instance is instantiated.
    @param           [data]            - Initial data to populate the instance with
    @param {Boolean} [forClone=false]  - Whether this instance is being created as a clone or not
    @return {Base} `this`
    */
    init: function ( data, forClone) {
      /*jshint unused:false */
      var self = this;
      self.$$arguments = m_copy(arguments);
      self.$$cbQueue = [];
      self.$$cbQueueIdx = 1;
      self.$$finals = [];
      self.$$listeners = {};
      self.$errors = {};
      return self;
    },
    /**
    Method to clone the instance.
    @return {Base} `new this.constructor(null, true)`
    @fires Base#cloned
    */
    clone: function () {
      var self = this,
          ret = new self.constructor(null, true);
      ret.$$arguments = m_copy(self.$$arguments);
      self.trigger('cloned', ret);
      return ret;
    },
    /**
    Indicates whether the instance has been finalized (resolved or rejected)
    @arg {number} [idx=this.$$cbQueueIdx] Thread index to check
    @return {Boolean}
    */
    isFinal: function (idx) {
      var self = this;
      idx = idx || self.$$cbQueueIdx;
      if (self.$$finals[idx]) {
        return !!(self.$$finals[idx].resolved || self.$$finals[idx].rejected);
      }
      return false;
    },
    /**
    Marks the promie thread as "resolved" (successfully complete). Sets `this.$loaded = true`, `this.$success = true`, `this.$failed = false`, and deletes `this.$busy`.
    @arg [idx=this.$$cbQueueIdx] - Promise thread to resolve
    @arg [data] - Data related to the resolution
    @fires Base#resolved
    @fires Base#finalized
    @return {Base} `this`
    */
    resolve: function (idx, data) {
      var self = this;
      idx = idx || self.$$cbQueueIdx;
      self.$loaded = true;
      self.$success = true;
      self.$failed = false;
      delete self.$busy;
      if (!self.isFinal(idx)) {
        self.$$finals[idx] = {
          resolved: true,
          data: data
        };
        executeQueue.call(self, idx, data);
        self.trigger('resolved', data);
      }
      return self;
    },
    /**
    Marks the promise thread as "rejected" (unsuccessfully complete). Sets `this.$loaded = true`, `this.$success = false`, `this.$failed = true`, and deletes `this.$busy`.
    @arg [idx=this.$$cbQueueIdx] - Promise thread to reject
    @arg [data] - Data related to the rejection
    @fires Base#rejected
    @fires Base#finalized
    @returns {Base} `this`
    */
    reject: function (idx, data) {
      var self = this;
      idx = idx || self.$$cbQueueIdx;
      self.$loaded = true;
      self.$success = false;
      self.$failed = true;
      delete self.$busy;
      if (!self.isFinal(idx)) {
        self.$$finals[idx] = {
          rejected: true,
          data: data
        };
        executeQueue.call(self, idx, data);
        self.trigger('rejected', data);
      }
      return self;
    },
    /**
    Triggers a progress step for the provided promise thread.
    @arg [idx=this.$$cbQueueIdx] - Promise thread to notify of progress
    @arg [data] - Data related to the progress step
    @fires Base#notified
    @returns {Base} `this`
    */
    notify: function (idx, data) {
      var self = this;
      idx = idx || self.$$cbQueueIdx;
      if (!self.isFinal(idx)) {
        executeQueue.call(self, idx, data);
        self.trigger('notified', data);
      }
      return self;
    },
    /**
    "Resets" the Promise state on the instance by incrementing the current promise thread index. Sets `this.$loaded = false` and deletes `this.$success` and `this.$failed`.
    @fires Base#unfinalized
    @returns {number} `idx` New promise thread index
    */
    unfinalize: function () {
      var self = this;
      self.$loaded = false;
      delete self.$success;
      delete self.$failed;
      self.trigger('unfinalized');
      return ++self.$$cbQueueIdx;
    },
    /**
    Attaches success/fail/progress callbacks to the current promise thread, which will trigger upon the next resolve/reject call respectively or, if the current promise thread is already final, immediately.
    @arg {Base~successCallback}   [success]
    @arg {Base~failCallback}      [fail]
    @arg {Base~progressCallback}  [progress]
    @returns {Base} `this`
    */
    /**
    Success callback will be triggered when/if the current promise thread is resolved.
    @callback Base~successCallback
    */
    /**
    Fail callback will be triggered when/if the current promise thread is rejected.
    @callback Base~failCallback
    */
    /**
    Progress callback will be triggered as the current promise thread passes through various states of progress.
    @callback Base~progressCallback
    */
    then: function(success, fail, progress) {
      var self = this;
      if (m_isFunction(success)) {
        self.$$cbQueue.push({
          type: 1,
          cb: success,
          idx: self.$$cbQueueIdx
        });
      }
      if (m_isFunction(fail)) {
        self.$$cbQueue.push({
          type: 3,
          cb: fail,
          idx: self.$$cbQueueIdx
        });
      }
      if (m_isFunction(progress)) {
        self.$$cbQueue.push({
          type: 4,
          cb: progress,
          idx: self.$$cbQueueIdx
        });
      }
      if (self.$$finals[self.$$cbQueueIdx]) {
        executeQueue.call(self, self.$$cbQueueIdx, self.$$finals[self.$$cbQueueIdx].data);
      }
      return self;
    },
    /**
    Attaches a callback to the current promise thread which will trigger upon the next finalization or, if the current promise thread is already final, immediately.
    @arg {Base~alwaysCallback} [always]
    @returns {Base} `this`
    */
    /**
    Always callback will be triggered when/if the current promise thread is finalized (either resolved OR rejected).
    @callback Base~alwaysCallback
    */
    always: function (always) {
      var self = this;
      if (m_isFunction(always)) {
        self.$$cbQueue.push({
          type: 2,
          cb: always,
          idx: self.$$cbQueueIdx
        });
      }
      if (self.$$finals[self.$$cbQueueIdx]) {
        executeQueue.call(self, self.$$cbQueueIdx, self.$$finals[self.$$cbQueueIdx].data);
      }
      return self;
    },
    /**
    Attaches success callback to the current promise thread.
    @param {Base~successCallback} [success]
    @return {Base} `this`
    */
    success: function (cb) {
      return this.then(cb);
    },
    /**
    Attaches fail callback to the current promise thread.
    @param {Base~failCallback} [fail]
    @return {Base} `this`
    */
    fail: function (cb) {
      return this.then(null, cb);
    },
    /**
    Attaches a progress callback to the current promise thread.
    @param {Base~progressCallback} [progress]
    @return {Base} `this`
    */
    progress: function (cb) {
      return this.then(null, null, cb);
    },
    /**
    Attaches a listener to an event type.
    @param {String} type - The type of event to listen for
    @param {Function} cb - The function to trigger every time the event type occurs
    @return {Base} `this`
    */
    bind: function (type, cb) {
      var self = this;
      if (m_isString(type) && m_isFunction(cb)) {
        self.$$listeners[type] = self.$$listeners[type] || [];
        self.$$listeners[type].push(cb);
      }
      return self;
    },
    /**
    Detaches either all listeners or just a single listener from an event type.
    @param {String} type - The type of event to unbind
    @param {Function} [listener] - The specific listener to unbind from the event type. If not provided, all listeners bound to the event type will be removed
    @return {Base} `this`
    */
    unbind: function (type, listener) {
      var self = this,
          idx;
      if (m_isString(type) && m_isArray(self.$$listeners[type]) && self.$$listeners[type].length > 0) {
        if (m_isFunction(listener)) {
          self.$$listeners[type] = filter(self.$$listeners[type], function (cb) {
            return cb !== listener;
          });
        } else {
          delete self.$$listeners[type];
        }
      }
      return self;
    },
    /**
    Attaches a one-time listener to an event type. After triggering once, the listener will automtically be unbound.
    @param {String} type - The type of event to listen for
    @param {Function} cb - The function to trigger the next time the event type occurs
    @return {Base} `this`
    */
    one: function (type, cb) {
      var self = this,
          wrap;
      if (m_isString(type) && m_isFunction(cb)) {
        wrap = function () {
          cb.call(this, arguments);
          self.unbind(type, wrap);
        };
        self.bind(type, wrap);
      }
      return self;
    },
    /**
    Triggers an event of the given type, passing any listeners the data provided.
    @param {String} type    - The type of event to trigger
    @param          [data]  - Object to pass into any listeners
    @return {Boolean} Returns `true` if all listeners return true, else `false`
    */
    trigger: function (type, data) {
      var self = this,
          ret = true;
      if (m_isString(type) && m_isArray(self.$$listeners[type]) && self.$$listeners[type].length > 0) {
        m_forEach(self.$$listeners[type], function (cb) {
          ret = cb.call(self, data, type) && ret;
        });
      }
      return ret;
    }
  };

  /**
  Allows for model extension
  @param {Object} properties - Properties to extend the new model with. Methods may call `this._super.apply(this, arguments)` to call parent model methods that are overwritten.
  @extends Base
  @return {Function} New constructor
  */
  Base.extend = function extend(properties) {
    var _super = this.prototype,
        proto, key;

    function construct(constructor, args) {
      function Class() {
        return constructor.apply(this, args);
      }
      Class.prototype = constructor.prototype;
      return new Class();
    }

    function createFnProp (key, fn, super2) {
      return function() {
        var tmp = this._super,
            ret;

        this._super = super2[ key ];
        ret = fn.apply(this, arguments);
        if (m_isFunction(tmp)) {
          this._super = tmp;
        } else {
          delete this._super;
        }
        return ret;
      };
    }
    
    function Class() {
      if (this.constructor !== Class) {
        return construct(Class, arguments);
      }
      if (!initializing && m_isFunction(this.init)) {
        return this.init.apply(this, arguments);
      }
    }

    initializing = true;
    proto = new this();
    initializing = false;
    if (!properties.$type) {
      properties.$type = 'Class';
    }

    if (m_isFunction(proto.$preExtend)) {
      properties = proto.$preExtend(properties);
    }
    for (key in properties) {
      if (properties.hasOwnProperty(key)) {
        if (m_isFunction(properties[ key ]) && m_isFunction(_super[ key ]) && superPattern.test(properties[ key ])) {
          proto[ key ] = createFnProp(key, properties[ key ], _super);
        } else {
          proto[ key ] = properties[ key ];
        }
      }
    }
    Class.prototype = proto;
    if (Object.defineProperty) {
      Object.defineProperty( Class.prototype, 'constructor', {
        enumerable: false,
        value: Class
      });
    } else {
      Class.prototype.constructor = Class;
    }
    Class.extend = extend;
    return Class;
  };
 
  /**
   * Return the constructor function
   */
  return Base;
}

angular.module( 'angular-m' )
  .factory( 'Base', BaseFactory );

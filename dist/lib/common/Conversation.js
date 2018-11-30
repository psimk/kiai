"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lodash_1 = require("lodash");
const MessageFormat = require("messageformat");
const uniqid = require("uniqid");
const App_1 = require("./App");
const Tracker_1 = require("./Tracker");
class Conversation {
    constructor({ config }) {
        this._locale = 'en-US';
        this.output = [];
        this.endConversation = false;
        this.suggestions = [];
        this.lastSpeech = { key: '' };
        this.intentHandlers = [];
        this.config = config;
    }
    get userId() {
        let userId = this.userData.id;
        if (!userId) {
            userId = uniqid();
            this.userData.id = userId;
        }
        return userId;
    }
    set locale(locale) {
        if (!this.locales[locale])
            return;
        this._locale = locale;
    }
    get locale() {
        return this._locale;
    }
    set repromptCount(count) {
        this.sessionData.__repromptCount = count;
    }
    get repromptCount() {
        return +(this.sessionData.__repromptCount || 0);
    }
    set currentFlow(flow) {
        this.sessionData.__flow = flow;
    }
    get currentFlow() {
        return (this.sessionData.__flow || '');
    }
    set timesInputRepeated(count) {
        this.sessionData.__timesInputRepeated = count;
    }
    get timesInputRepeated() {
        return (this.sessionData.__timesInputRepeated || 0);
    }
    set context(context) {
        this.sessionData.__context = context;
    }
    get context() {
        return this.sessionData.__context;
    }
    set previousContext(context) {
        this.sessionData.__previousContext = context;
    }
    get previousContext() {
        return this.sessionData.__previousContext;
    }
    set previousSpeech(speech) {
        this.sessionData.__lastSpeech = speech;
    }
    get previousSpeech() {
        return (this.sessionData.__lastSpeech || { key: '' });
    }
    set previousSuggestions(suggestions) {
        this.sessionData.__lastSuggestions = suggestions;
    }
    get previousSuggestions() {
        return (this.sessionData.__lastSuggestions || []);
    }
    get lastUsedDialogVariants() {
        this.sessionData.__lastVariants = this.sessionData.__lastVariants || {};
        return this.sessionData.__lastVariants;
    }
    set permissionCallbacks(callbacks) {
        this.sessionData.__permissionCallbacks = callbacks;
    }
    get permissionCallbacks() {
        return (this.sessionData.__permissionCallbacks || ['', '']);
    }
    get storageUrl() {
        return (this.config.storage.rootUrl || '');
    }
    set confirmationCallbacks(options) {
        this.sessionData.__confirmation = options;
    }
    get confirmationCallbacks() {
        return this.sessionData.__confirmation;
    }
    get returnDirectives() {
        if (!this.sessionData.__callbacks)
            this.sessionData.__callbacks = [];
        return this.sessionData.__callbacks;
    }
    get payloads() {
        if (!this.sessionData.__payloads)
            this.sessionData.__payloads = [];
        return this.sessionData.__payloads;
    }
    get dialog() {
        return this.config.dialog[this.locale];
    }
    get voice() {
        return this.config.voice[this.locale] || [];
    }
    get flows() {
        return this.config.flows;
    }
    get locales() {
        return this.config.locales;
    }
    get trackingDataCollector() {
        return this.config.tracking.dataCollector;
    }
    suggest(...suggestions) {
        this.suggestions = this.suggestions.concat(suggestions);
        return this;
    }
    translate(path, params = []) {
        let msgSrc = lodash_1.get(this.locales[this.locale], path);
        if (!msgSrc) {
            console.warn(`Translation not defined for language "${this.locale}", path "${path}"`);
            return path;
        }
        if (lodash_1.isArray(msgSrc))
            msgSrc = lodash_1.sample(msgSrc);
        const mf = new MessageFormat(this.locale);
        const msg = mf.compile(msgSrc);
        return msg(Object.assign({}, params));
    }
    say(key, params) {
        key = String(key);
        this.lastSpeech = { key, params };
        const regex = new RegExp(`^${key.replace('*', '\\d+')}$`);
        let dialogVariants = Object.keys(this.dialog).filter(key => regex.test(key));
        let speech;
        if (!dialogVariants.length) {
            speech = key;
        }
        else {
            let dialogVariant;
            if (dialogVariants.length === 1) {
                dialogVariant = dialogVariants[0];
            }
            else {
                const lastUsedVariant = this.lastUsedDialogVariants[key];
                if (lastUsedVariant) {
                    dialogVariants = dialogVariants.filter(variant => variant !== lastUsedVariant);
                }
                dialogVariant = lodash_1.sample(dialogVariants);
                this.lastUsedDialogVariants[key] = dialogVariant;
            }
            speech = this.dialog[dialogVariant];
            if (params) {
                Object.keys(params).forEach(key => {
                    speech = speech.replace(`{${key}}`, params[key]);
                });
            }
            const voices = this.voice.filter(key => new RegExp(`^${dialogVariant}_?[A-Z]`).test(key));
            if (voices.length) {
                return this.speak(lodash_1.sample(voices), speech);
            }
        }
        return this.add(speech);
    }
    next(intent, payload) {
        intent = this.resolveIntent(intent);
        let [flowName, intentName] = intent.split(App_1.default.INTENT_DELIMITER);
        const handler = this.flows[flowName][intentName];
        if (typeof handler !== 'function') {
            throw new Error(`Target intent not found: "${flowName}${App_1.default.INTENT_DELIMITER}${intentName}"`);
        }
        this.currentFlow = flowName;
        this.currentIntent = intentName;
        return this.addHandler(handler, payload);
    }
    returnTo(intent) {
        this.returnDirectives.push(this.resolveIntent(intent));
        return this;
    }
    end() {
        this.endConversation = true;
        return this;
    }
    compare(string1, string2) {
        return !string1.localeCompare(string2, this.locale, {
            usage: 'search',
            sensitivity: 'base',
            ignorePunctuation: true,
        });
    }
    expect(context) {
        this.context = context;
        return this;
    }
    repeat() {
        if (this.previousSpeech.key)
            this.say(this.previousSpeech.key, this.previousSpeech.params);
        this.suggest(...this.previousSuggestions);
        return this;
    }
    pause() {
        this.add('\n  <break time=".5s"/>');
        return this;
    }
    return(payload) {
        const intentDirective = this.returnDirectives.pop();
        if (!intentDirective)
            throw new Error('Conversation.return() called but no return intent set.');
        return this.next(intentDirective, payload);
    }
    confirm(options) {
        const confirmationOptions = Object.keys(options);
        confirmationOptions.forEach(key => (options[key] = this.resolveIntent(options[key])));
        this.confirmationCallbacks = options;
        return this.suggest(...confirmationOptions).expect('confirmation');
    }
    track(event, data) {
        this.tracker =
            this.tracker || new Tracker_1.default({ config: this.config.tracking, userId: this.userId });
        let userData;
        if (typeof this.trackingDataCollector === 'function')
            userData = this.trackingDataCollector(this);
        this.tracker.trackEvent({ event, data, userData });
        return this;
    }
    addHandler(handler, payload) {
        this.intentHandlers.push({ handler, payload });
        this.payloads.push(payload);
        return this;
    }
    handleConfirmation(option) {
        const intent = this.confirmationCallbacks[option];
        this.confirmationCallbacks = {};
        return this.next(intent);
    }
    handlePermission(granted) {
        return this.next(this.permissionCallbacks[+!granted]);
    }
    handleIntent() {
        return new Promise(resolve => {
            const executeHandler = () => {
                if (!this.intentHandlers.length) {
                    resolve();
                }
                else {
                    const { handler, payload } = this.intentHandlers.shift();
                    Promise.resolve(handler(this, payload)).then(() => executeHandler());
                }
            };
            setTimeout(executeHandler, 0);
        }).then(() => this.sendResponse());
    }
    resolveIntent(intent) {
        let [flowName, intentName] = intent.split(App_1.default.INTENT_DELIMITER);
        if (!flowName)
            flowName = this.currentFlow;
        if (!intentName) {
            const flow = this.flows[flowName];
            if (!flow)
                throw new Error(`Target flow not found: "${flowName}"`);
            intentName = flow.entryPoint || 'start';
        }
        return `${flowName}${App_1.default.INTENT_DELIMITER}${intentName}`;
    }
}
exports.default = Conversation;
//# sourceMappingURL=Conversation.js.map
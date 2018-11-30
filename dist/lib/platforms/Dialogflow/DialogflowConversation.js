"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const actions_on_google_1 = require("actions-on-google");
const lodash_1 = require("lodash");
const Conversation_1 = require("../../common/Conversation");
class DialogflowConversation extends Conversation_1.default {
    constructor() {
        super(...arguments);
        this.PERMISSIONS = {
            NAME: 'NAME',
            DEVICE_PRECISE_LOCATION: 'DEVICE_PRECISE_LOCATION',
            DEVICE_COARSE_LOCATION: 'DEVICE_COARSE_LOCATION',
        };
        this.responses = [];
    }
    get sessionData() {
        return this.conversationObject.data;
    }
    get userData() {
        return this.conversationObject.user.storage;
    }
    setConversationObject(conversationObject) {
        this.conversationObject = conversationObject;
    }
    resetContext() {
        this.previousContext = this.context;
        this.context = '';
        return this;
    }
    show(image, alt = image) {
        const wildcard = /\{(\d+)\}/;
        const matches = image.match(wildcard);
        if (matches) {
            image = image.replace(wildcard, String(lodash_1.sample(lodash_1.range(+matches[1])) + 1));
        }
        const url = `${this.storageUrl}images/${image}.png`;
        return this.add(new actions_on_google_1.Image({ url, alt }));
    }
    canTransfer(...capabilities) {
        const availableCapabilities = this.conversationObject.available.surfaces.capabilities;
        return capabilities.reduce((result, capability) => result && availableCapabilities.has(capability), true);
    }
    canRedirect() {
        return (this.canLinkOut() ||
            this.canTransfer(DialogflowConversation.CAPABILITIES.SCREEN_OUTPUT, DialogflowConversation.CAPABILITIES.WEB_BROWSER));
    }
    redirect({ url, name, description = name, }) {
        if (this.canLinkOut())
            return this.add(new actions_on_google_1.LinkOutSuggestion({ url, name }));
        if (this.canTransfer(DialogflowConversation.CAPABILITIES.SCREEN_OUTPUT, DialogflowConversation.CAPABILITIES.WEB_BROWSER)) {
            return this.add(new actions_on_google_1.NewSurface({
                context: description,
                notification: description,
                capabilities: [
                    DialogflowConversation.CAPABILITIES.SCREEN_OUTPUT,
                    DialogflowConversation.CAPABILITIES.WEB_BROWSER,
                ],
            }));
        }
        return this;
    }
    play(sound, fallback = '') {
        const path = `${this.config.storage.rootUrl}${this.config.storage.paths.sfx}`;
        const extension = lodash_1.get(this.config, ['sfx', 'extension'], 'mp3');
        return this.add(`<audio src="${path}${sound}.${extension}">${fallback}</audio>`);
    }
    speak(voice, text = '') {
        return this.add(`<audio src="${this.config.storage.rootUrl}${this.config.storage.paths.voice}${this.locale}/${voice}.wav">${text}</audio>`);
    }
    /*
    login(callbackIntent: string, speech: string = ''): Conversation {
      this.sessionData.__loginCallback = callbackIntent;
      return this.add(new SignIn(speech));
    }
  */
    /*
    event(event: string): DialogflowConversation {
      this.followUpEvent = event;
      return this;
    }
  */
    requestPermission(permissions, deniedIntent, text) {
        if (typeof permissions === 'string')
            permissions = [permissions];
        const grantedIntent = this.resolveIntent(`:${this.currentIntent}`);
        deniedIntent = this.resolveIntent(deniedIntent);
        this.permissionCallbacks = [grantedIntent, deniedIntent];
        return this.add(new actions_on_google_1.Permission({
            context: text,
            permissions: permissions,
        })).expect('permission_confirmation');
    }
    showCard({ title, subtitle, text, image, buttons = [], }) {
        const imageUrl = image && `${this.storageUrl}images/${image}.png`;
        return this.add(new actions_on_google_1.BasicCard({
            title,
            subtitle,
            text,
            image: image && new actions_on_google_1.Image({ url: imageUrl, alt: image }),
            buttons: buttons.map(button => new actions_on_google_1.Button(button)),
        }));
    }
    list(title, items) {
        items = items.map(item => ({
            title: item.title,
            optionInfo: { key: item.title, synonyms: item.synonyms },
            description: item.description,
            image: item.imageUrl && new actions_on_google_1.Image({ url: item.imageUrl, alt: item.title }),
        }));
        return this.add(new actions_on_google_1.List({ title, items }));
    }
    respond() {
        const simpleResponses = this.output.filter(response => typeof response === 'string');
        if (simpleResponses.length)
            this.responses.push(`<speak>${simpleResponses.join(' ')}</speak>`);
        this.responses = this.responses.concat(this.output.filter(response => typeof response !== 'string'));
        this.output = [];
        return this;
    }
    hasDisplay() {
        return this.conversationObject.surface.capabilities.has(DialogflowConversation.CAPABILITIES.SCREEN_OUTPUT);
    }
    hasBrowser() {
        return this.conversationObject.surface.capabilities.has(DialogflowConversation.CAPABILITIES.WEB_BROWSER);
    }
    add(output) {
        this.output.push(output);
        return this;
    }
    sendResponse() {
        if (this.context)
            this.conversationObject.contexts.set(this.context, 999);
        if (this.previousContext && this.previousContext !== this.context) {
            this.conversationObject.contexts.delete(this.previousContext);
            this.conversationObject.contexts.delete(this.previousContext.toLowerCase());
        }
        this.respond();
        const imagesAndCards = this.responses.filter(response => response instanceof actions_on_google_1.Image || response instanceof actions_on_google_1.BasicCard);
        if (imagesAndCards.length > 1) {
            console.warn('Only 1 image or card per response allowed. Only the last image will be shown.');
            imagesAndCards.pop();
            this.responses = lodash_1.without(this.responses, ...imagesAndCards);
        }
        this.responses.forEach(item => {
            this.conversationObject.add(item);
        });
        this.responses = [];
        this.previousSpeech = this.lastSpeech;
        this.lastSpeech = { key: '' };
        this.previousSuggestions = this.suggestions;
        if (this.suggestions.length) {
            this.conversationObject.add(new actions_on_google_1.Suggestions(this.suggestions.map(suggestion => this.translate(suggestion).substring(0, 25))));
            this.suggestions = [];
        }
        if (this.endConversation) {
            this.conversationObject.close();
            this.endConversation = false;
        }
        if (this.followUpEvent) {
            this.conversationObject.followup(this.followUpEvent);
            this.followUpEvent = '';
        }
        return this;
    }
    canLinkOut() {
        const capabilities = this.conversationObject.surface.capabilities;
        return (capabilities.has(DialogflowConversation.CAPABILITIES.SCREEN_OUTPUT) &&
            capabilities.has(DialogflowConversation.CAPABILITIES.WEB_BROWSER));
    }
}
DialogflowConversation.CAPABILITIES = {
    SCREEN_OUTPUT: 'actions.capability.SCREEN_OUTPUT',
    WEB_BROWSER: 'actions.capability.WEB_BROWSER',
};
exports.default = DialogflowConversation;
//# sourceMappingURL=DialogflowConversation.js.map
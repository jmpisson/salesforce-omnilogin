import 'webextension-polyfill';
import oauthProvider from './modules/oauth';

function getCredentials() {
    return new Promise( (resolve, reject) => {
        chrome.storage.local.get('credentials', function (storedCredentials) {
            resolve(storedCredentials? storedCredentials.credentials:{});
        });
    });
}

function saveCredentials(credentials) {
    return getCredentials().then(storedCredentials => {
        storedCredentials = storedCredentials || {};
        storedCredentials[credentials.identity.user_id] = credentials;

        chrome.storage.local.set({ credentials: storedCredentials });
    });
}

function deleteCredentials(id) {
    return getCredentials().then(storedCredentials => {
        storedCredentials = storedCredentials || {};

        delete storedCredentials[id];

        chrome.storage.local.set({ credentials: storedCredentials });
    });
}

function loginAs(id) {
    return getCredentials().then(storedCredentials => {
        storedCredentials = storedCredentials || {};
        
        let credentials = storedCredentials[id] || {};

        return oauthProvider.refresh(credentials.authorization).then(updatedCredentials => {
            var endpoint = updatedCredentials.authorization.sfdc_community_url? updatedCredentials.authorization.sfdc_community_url:updatedCredentials.authorization.instance_url;

            chrome.tabs.create({
                url: `${endpoint}/secur/frontdoor.jsp?sid=${updatedCredentials.authorization.access_token}`
            });
            
            return saveCredentials(Object.assign(credentials, updatedCredentials));
        });
    });
}



chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    var keepOpened = false;

    if (message.namespace === 'omnilogin') {
        if (message.channel === 'oauth') {
            if (message.payload.method === 'authorize') {
                keepOpened = true;

                oauthProvider.authorize({
                    domain: message.payload.params.loginUrl
                }).then(credentials => {
                    credentials.sectionId = message.payload.params.sectionId;

                    return saveCredentials(credentials).then( () => {
                        chrome.tabs.create({
                            url: `${credentials.authorization.instance_url}/secur/frontdoor.jsp?sid=${credentials.authorization.access_token}`
                          });
                    });
                }).then(() => {
                    sendResponse({
                        success: true
                    });
                }).catch(error => {
                    sendResponse({
                        success: false,
                        error: error.message || error
                    });
                })
            } else if (message.payload.method === 'getCredentials') {
                keepOpened = true;
                getCredentials().then( (credentials) => {
                    sendResponse({
                        success: true,
                        payload: credentials
                    });
                }).catch(error => {
                    sendResponse({
                        success: false,
                        error: error.message || error
                    });
                })
            } else if (message.payload.method === 'deleteCredentials') {
                keepOpened = true;
                deleteCredentials(message.payload.params.id).then( () => {
                    sendResponse({
                        success: true
                    });
                }).catch(error => {
                    sendResponse({
                        success: false,
                        error: error.message || error
                    });
                })
            } else if (message.payload.method === 'loginAs') {
                keepOpened = true;
                loginAs(message.payload.params.id).then( () => {
                    sendResponse({
                        success: true
                    });
                }).catch(error => {
                    sendResponse({
                        success: false,
                        error: error.message || error
                    });
                })
            }
        }


    }

    return keepOpened;
});
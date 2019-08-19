/* Copyright (c) 2019 The Brave Authors. All rights reserved.
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.chromium.chrome.browser.signin;

import org.chromium.base.ContextUtils;
import org.chromium.components.sync.AndroidSyncSettings;

/**
 * Brave's extension for SigninManager.
 */
public class BraveSigninManager extends SigninManager {
    protected BraveSigninManager(SigninManagerDelegate delegate) {
        super(ContextUtils.getApplicationContext(), delegate,
            IdentityServicesProvider.getAccountTrackerService(), AndroidSyncSettings.get());
    }

    @Override
    public boolean isSigninSupported() {
        return false;
    }
}

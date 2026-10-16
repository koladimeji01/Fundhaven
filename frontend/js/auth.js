
/* =========================================================
   AUTHENTICATION HELPERS
   ========================================================= */


/*
   Check whether the user has an access token.
*/
function isAuthenticated() {

    const token =
        localStorage.getItem("access_token");

    return !!token;
}


/*
   Get the current access token.
*/
function getAccessToken() {

    return localStorage.getItem(
        "access_token"
    );
}


/*
   Get the logged-in user's email.
*/
function getUserEmail() {

    return localStorage.getItem(
        "user_email"
    );
}


/*
   Get the logged-in user's name.
*/
function getUserName() {

    return localStorage.getItem(
        "user_name"
    );
}


/*
   Get the logged-in user's ID.
*/
function getUserId() {

    return localStorage.getItem(
        "user_id"
    );
}


/* =========================================================
   LOGIN PAGE PROTECTION
   ========================================================= */


/*
   If the user is already logged in,
   don't allow them to remain on the login page.
*/
function redirectIfAuthenticated() {

    if (isAuthenticated()) {

        window.location.replace("dashboard.html");

    }

}


/* =========================================================
   PROTECTED PAGE PROTECTION
   ========================================================= */


/*
   Pages that require authentication should
   call this function.
*/
function requireAuthentication() {

    if (!isAuthenticated()) {

        window.location.replace("login.html");

        return false;

    }

    return true;

}


/* =========================================================
   LOGOUT
   ========================================================= */


/*
   Completely clear the current login session.
*/
function logout() {

    localStorage.removeItem(
        "access_token"
    );

    localStorage.removeItem(
        "user_email"
    );

    localStorage.removeItem(
        "user_name"
    );

    localStorage.removeItem(
        "user_id"
    );


    window.location.replace("login.html");

}


/* =========================================================
   AUTHENTICATED API REQUEST
   ========================================================= */


/*
   Make an API request using the current
   authentication token.
*/
async function authenticatedFetch(
    url,
    options = {}
) {

    const token =
        getAccessToken();


    if (!token) {

        logout();

        return null;

    }


    const headers = {
        ...(options.headers || {}),
        "Authorization":
            `Bearer ${token}`
    };


    const response =
        await fetch(
            url,
            {
                ...options,
                headers: headers
            }
        );


    /*
       If the backend says the token is invalid
       or expired, clear the session.
    */
    if (
        response.status === 401 ||
        response.status === 403
    ) {

        logout();

        return null;

    }


    return response;

}
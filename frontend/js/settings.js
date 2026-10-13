const API_URL = (window.BUDGETWISE_API_BASE_URL || "http://127.0.0.1:8000/api/v1");
let originalProfile = {
name: "",
email: "",
income: ""
};
let toastTimer = null;
/* ============================================================
INITIALIZATION
============================================================ */
document.addEventListener("DOMContentLoaded", async function () {
setupMobileMenu();
setupSettingsTabs();
setupProfileForm();
setupSecurityActions();
setupNotificationSettings();
setupPreferences();
setupSearch();
setupNotificationButton();

loadSavedNotifications();
loadSavedPreferences();

createChangePasswordModal();

await loadUser();
await setupMonthlyEmailPreference();

refreshIcons();
});
/* ============================================================
AUTH
============================================================ */
function getToken() {
return localStorage.getItem("access_token");
}
function logout() {
localStorage.removeItem("access_token");
localStorage.removeItem("user_email");
localStorage.removeItem("user_name");
localStorage.removeItem("user_id");

window.location.replace("login.html");
}
/* ============================================================
API REQUEST HELPER
============================================================ */
async function apiRequest(url, options = {}) {
const token = getToken();

if (!token) {
    logout();
    return null;
}

const headers = {
    "Authorization": `Bearer ${token}`,
    ...(options.headers || {})
};

const response = await fetch(url, {
    ...options,
    headers
});

if (response.status === 401) {
    logout();
    return null;
}

return response;
}
/* ============================================================
LOAD USER PROFILE
============================================================ */
async function loadUser() {
try {

    const response = await apiRequest(
        `${API_URL}/users/me`,
        {
            method: "GET"
        }
    );

    if (!response) {
        return;
    }

    if (!response.ok) {

        let errorMessage = "Unable to load your profile.";

        try {
            const errorData = await response.json();

            if (errorData.detail) {
                errorMessage = errorData.detail;
            }

        } catch (error) {
            // Ignore JSON parsing errors.
        }

        showToast(errorMessage, true);
        return;
    }

    const user = await response.json();

    const name =
        user.name ||
        user.full_name ||
        user.username ||
        localStorage.getItem("user_name") ||
        "User";

    const email =
        user.email ||
        localStorage.getItem("user_email") ||
        "";

    const income =
        user.income !== undefined && user.income !== null
            ? user.income
            : "";

    originalProfile = {
        name: name,
        email: email,
        income: income
    };

    localStorage.setItem("user_name", name);

    if (email) {
        localStorage.setItem("user_email", email);
    }

    updateProfileUI(
        name,
        email,
        income
    );

} catch (error) {

    console.error(
        "Profile loading error:",
        error
    );

    const savedName =
        localStorage.getItem("user_name") ||
        "User";

    const savedEmail =
        localStorage.getItem("user_email") ||
        "";

    updateProfileUI(
        savedName,
        savedEmail,
        ""
    );

    showToast(
        "Unable to load your profile.",
        true
    );
}
}
/* ============================================================
UPDATE PROFILE UI
============================================================ */
function updateProfileUI(
name,
email,
income
) {
const profileName =
    document.getElementById("profileName");

const profileEmail =
    document.getElementById("profileEmail");

const profileIncome =
    document.getElementById("profileIncome");

const profileDisplayName =
    document.getElementById("profileDisplayName");

const profileDisplayEmail =
    document.getElementById("profileDisplayEmail");

const profileAvatar =
    document.getElementById("profileAvatar");

const sidebarUserName =
    document.getElementById("sidebarUserName");

const sidebarUserEmail =
    document.getElementById("sidebarUserEmail");

const sidebarAvatar =
    document.getElementById("sidebarAvatar");

const topUserName =
    document.getElementById("topUserName");

const topAvatar =
    document.getElementById("topAvatar");


if (profileName) {
    profileName.value = name;
}

if (profileEmail) {
    profileEmail.value = email;
}

if (profileIncome) {
    profileIncome.value = income;
}

if (profileDisplayName) {
    profileDisplayName.textContent = name;
}

if (profileDisplayEmail) {
    profileDisplayEmail.textContent =
        email || "No email address";
}

const initial = getInitial(name);

if (profileAvatar) {
    profileAvatar.textContent = initial;
}

if (sidebarUserName) {
    sidebarUserName.textContent = name;
}

if (sidebarUserEmail) {
    sidebarUserEmail.textContent =
        email || "Personal Account";
}

if (sidebarAvatar) {
    sidebarAvatar.textContent = initial;
}

if (topUserName) {
    topUserName.textContent = name;
}

if (topAvatar) {
    topAvatar.textContent = initial;
}
}
/* ============================================================
GET USER INITIAL
============================================================ */
function getInitial(name) {
if (!name) {
    return "U";
}

return name
    .trim()
    .charAt(0)
    .toUpperCase();
}
/* ============================================================
SETTINGS TABS
============================================================ */
function setupSettingsTabs() {
const tabs =
    document.querySelectorAll(".settings-tab");

const sections =
    document.querySelectorAll(".settings-section");

tabs.forEach(function (tab) {

    tab.addEventListener("click", function () {

        const sectionId =
            tab.getAttribute("data-section");

        tabs.forEach(function (item) {
            item.classList.remove("active");
        });

        sections.forEach(function (section) {
            section.classList.remove("active");
        });

        tab.classList.add("active");

        const selectedSection =
            document.getElementById(sectionId);

        if (selectedSection) {
            selectedSection.classList.add("active");
        }

        refreshIcons();
    });
});
}
/* ============================================================
PROFILE FORM
============================================================ */
function setupProfileForm() {
const form =
    document.getElementById("profileForm");

const cancelButton =
    document.getElementById("profileCancelBtn");

if (!form) {
    return;
}


form.addEventListener("submit", async function (event) {

    event.preventDefault();

    const nameInput =
        document.getElementById("profileName");

    const incomeInput =
        document.getElementById("profileIncome");

    const saveButton =
        document.getElementById("profileSaveBtn");

    if (!nameInput || !incomeInput) {
        return;
    }

    const name =
        nameInput.value.trim();

    const incomeValue =
        incomeInput.value.trim();

    if (!name) {

        showToast(
            "Please enter your full name.",
            true
        );

        nameInput.focus();
        return;
    }

    if (name.length < 2) {

        showToast(
            "Name must be at least 2 characters.",
            true
        );

        nameInput.focus();
        return;
    }

    if (!incomeValue) {

        showToast(
            "Please enter your monthly income.",
            true
        );

        incomeInput.focus();
        return;
    }

    const income =
        Number(incomeValue);

    if (!Number.isFinite(income) || income <= 0) {

        showToast(
            "Income must be greater than 0.",
            true
        );

        incomeInput.focus();
        return;
    }


    const originalButtonText =
        saveButton
            ? saveButton.textContent
            : "Save Changes";


    try {

        if (saveButton) {
            saveButton.disabled = true;
            saveButton.textContent = "Saving...";
        }


        const response = await apiRequest(
            `${API_URL}/users/me`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    name: name,
                    income: income
                })
            }
        );

        if (!response) {
            return;
        }


        const data =
            await readResponseData(response);


        if (!response.ok) {

            throw new Error(
                getApiErrorMessage(
                    data,
                    "Unable to update your profile."
                )
            );
        }


        const updatedUser =
            data || {};

        const updatedName =
            updatedUser.name || name;

        const updatedEmail =
            updatedUser.email ||
            originalProfile.email ||
            localStorage.getItem("user_email") ||
            "";

        const updatedIncome =
            updatedUser.income !== undefined &&
            updatedUser.income !== null
                ? updatedUser.income
                : income;


        originalProfile = {
            name: updatedName,
            email: updatedEmail,
            income: updatedIncome
        };


        localStorage.setItem(
            "user_name",
            updatedName
        );

        if (updatedEmail) {
            localStorage.setItem(
                "user_email",
                updatedEmail
            );
        }


        updateProfileUI(
            updatedName,
            updatedEmail,
            updatedIncome
        );


        showToast(
            "Profile updated successfully."
        );

    } catch (error) {

        console.error(
            "Profile update error:",
            error
        );

        showToast(
            error.message ||
            "Unable to update your profile.",
            true
        );

    } finally {

        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent =
                originalButtonText;
        }
    }

});


if (cancelButton) {

    cancelButton.addEventListener(
        "click",
        function () {

            updateProfileUI(
                originalProfile.name ||
                "User",

                originalProfile.email ||
                "",

                originalProfile.income ||
                ""
            );

            showToast(
                "Changes cancelled."
            );
        }
    );
}
}
/* ============================================================
SECURITY ACTIONS
============================================================ */
function setupSecurityActions() {
const changePasswordButton =
    document.getElementById("changePasswordBtn");

const logoutButton =
    document.getElementById("logoutBtn");

const deleteAccountButton =
    document.getElementById("deleteAccountBtn");


if (changePasswordButton) {

    changePasswordButton.addEventListener(
        "click",
        function () {

            openChangePasswordModal();
        }
    );
}


if (logoutButton) {

    logoutButton.addEventListener(
        "click",
        function () {

            const confirmed =
                window.confirm(
                    "Are you sure you want to log out?"
                );

            if (confirmed) {
                logout();
            }
        }
    );
}


if (deleteAccountButton) {

    deleteAccountButton.addEventListener(
        "click",
        function () {

            showToast(
                "Account deletion will be connected to the backend next.",
                true
            );
        }
    );
}
}
/* ============================================================
CHANGE PASSWORD MODAL
============================================================ */
function createChangePasswordModal() {
if (document.getElementById("changePasswordModal")) {
    return;
}


const modal =
    document.createElement("div");

modal.id = "changePasswordModal";

modal.innerHTML = `
    <div class="password-modal-overlay" id="passwordModalOverlay">

        <div
            class="password-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="changePasswordTitle"
        >

            <div class="password-modal-header">

                <div>
                    <h2 id="changePasswordTitle">
                        Change Password
                    </h2>

                    <p>
                        Create a new secure password for your BudgetWise account.
                    </p>
                </div>

                <button
                    type="button"
                    class="password-modal-close"
                    id="closePasswordModal"
                    aria-label="Close"
                >
                    <i data-lucide="x"></i>
                </button>

            </div>


            <form id="changePasswordForm">

                <div class="password-modal-body">

                    <div class="password-field">

                        <label for="currentPassword">
                            Current Password
                        </label>

                        <div class="password-input-wrapper">

                            <input
                                type="password"
                                id="currentPassword"
                                autocomplete="current-password"
                                placeholder="Enter your current password"
                                required
                            >

                            <button
                                type="button"
                                class="password-toggle"
                                data-target="currentPassword"
                                aria-label="Show password"
                            >
                                <i data-lucide="eye"></i>
                            </button>

                        </div>

                    </div>


                    <div class="password-field">

                        <label for="newPassword">
                            New Password
                        </label>

                        <div class="password-input-wrapper">

                            <input
                                type="password"
                                id="newPassword"
                                autocomplete="new-password"
                                placeholder="Enter your new password"
                                minlength="8"
                                required
                            >

                            <button
                                type="button"
                                class="password-toggle"
                                data-target="newPassword"
                                aria-label="Show password"
                            >
                                <i data-lucide="eye"></i>
                            </button>

                        </div>

                        <span class="password-help">
                            Password must be at least 8 characters.
                        </span>

                    </div>


                    <div class="password-field">

                        <label for="confirmPassword">
                            Confirm New Password
                        </label>

                        <div class="password-input-wrapper">

                            <input
                                type="password"
                                id="confirmPassword"
                                autocomplete="new-password"
                                placeholder="Re-enter your new password"
                                minlength="8"
                                required
                            >

                            <button
                                type="button"
                                class="password-toggle"
                                data-target="confirmPassword"
                                aria-label="Show password"
                            >
                                <i data-lucide="eye"></i>
                            </button>

                        </div>

                    </div>

                </div>


                <div class="password-modal-actions">

                    <button
                        type="button"
                        class="btn btn-secondary"
                        id="cancelPasswordBtn"
                    >
                        Cancel
                    </button>

                    <button
                        type="submit"
                        class="btn btn-primary"
                        id="submitPasswordBtn"
                    >
                        Change Password
                    </button>

                </div>

            </form>

        </div>

    </div>
`;


document.body.appendChild(modal);


addPasswordModalStyles();


setupPasswordModalEvents();


refreshIcons();
}
/* ============================================================
PASSWORD MODAL EVENTS
============================================================ */
function setupPasswordModalEvents() {
const modal =
    document.getElementById("changePasswordModal");

const overlay =
    document.getElementById("passwordModalOverlay");

const closeButton =
    document.getElementById("closePasswordModal");

const cancelButton =
    document.getElementById("cancelPasswordBtn");

const form =
    document.getElementById("changePasswordForm");


if (closeButton) {

    closeButton.addEventListener(
        "click",
        closeChangePasswordModal
    );
}


if (cancelButton) {

    cancelButton.addEventListener(
        "click",
        closeChangePasswordModal
    );
}


if (overlay) {

    overlay.addEventListener(
        "click",
        function (event) {

            if (event.target === overlay) {
                closeChangePasswordModal();
            }
        }
    );
}


document.addEventListener(
    "keydown",
    function (event) {

        if (
            event.key === "Escape" &&
            modal &&
            modal.classList.contains("open")
        ) {
            closeChangePasswordModal();
        }
    }
);


const toggleButtons =
    document.querySelectorAll(
        ".password-toggle"
    );


toggleButtons.forEach(function (button) {

    button.addEventListener(
        "click",
        function () {

            const targetId =
                button.getAttribute(
                    "data-target"
                );

            const input =
                document.getElementById(
                    targetId
                );

            if (!input) {
                return;
            }

            const icon =
                button.querySelector("i");

            if (input.type === "password") {

                input.type = "text";

                button.setAttribute(
                    "aria-label",
                    "Hide password"
                );

                if (icon) {
                    icon.setAttribute(
                        "data-lucide",
                        "eye-off"
                    );
                }

            } else {

                input.type = "password";

                button.setAttribute(
                    "aria-label",
                    "Show password"
                );

                if (icon) {
                    icon.setAttribute(
                        "data-lucide",
                        "eye"
                    );
                }
            }

            refreshIcons();
        }
    );
});


if (form) {

    form.addEventListener(
        "submit",
        handleChangePassword
    );
}
}
/* ============================================================
OPEN CHANGE PASSWORD MODAL
============================================================ */
function openChangePasswordModal() {
const modal =
    document.getElementById("changePasswordModal");

if (!modal) {
    createChangePasswordModal();
    return openChangePasswordModal();
}


const form =
    document.getElementById(
        "changePasswordForm"
    );

if (form) {
    form.reset();
}


const submitButton =
    document.getElementById(
        "submitPasswordBtn"
    );

if (submitButton) {

    submitButton.disabled = false;

    submitButton.textContent =
        "Change Password";
}


modal.classList.add("open");

document.body.classList.add(
    "password-modal-open"
);


setTimeout(function () {

    const currentPassword =
        document.getElementById(
            "currentPassword"
        );

    if (currentPassword) {
        currentPassword.focus();
    }

}, 100);
}
/* ============================================================
CLOSE CHANGE PASSWORD MODAL
============================================================ */
function closeChangePasswordModal() {
const modal =
    document.getElementById(
        "changePasswordModal"
    );

if (!modal) {
    return;
}

modal.classList.remove("open");

document.body.classList.remove(
    "password-modal-open"
);


const form =
    document.getElementById(
        "changePasswordForm"
    );

if (form) {
    form.reset();
}
}
/* ============================================================
HANDLE CHANGE PASSWORD
============================================================ */
async function handleChangePassword(event) {
event.preventDefault();


const currentPasswordInput =
    document.getElementById(
        "currentPassword"
    );

const newPasswordInput =
    document.getElementById(
        "newPassword"
    );

const confirmPasswordInput =
    document.getElementById(
        "confirmPassword"
    );

const submitButton =
    document.getElementById(
        "submitPasswordBtn"
    );


if (
    !currentPasswordInput ||
    !newPasswordInput ||
    !confirmPasswordInput
) {
    showToast(
        "Password form is unavailable.",
        true
    );

    return;
}


const currentPassword =
    currentPasswordInput.value;

const newPassword =
    newPasswordInput.value;

const confirmPassword =
    confirmPasswordInput.value;


if (!currentPassword) {

    showToast(
        "Please enter your current password.",
        true
    );

    currentPasswordInput.focus();
    return;
}


if (!newPassword) {

    showToast(
        "Please enter a new password.",
        true
    );

    newPasswordInput.focus();
    return;
}


if (newPassword.length < 8) {

    showToast(
        "New password must be at least 8 characters.",
        true
    );

    newPasswordInput.focus();
    return;
}


if (!confirmPassword) {

    showToast(
        "Please confirm your new password.",
        true
    );

    confirmPasswordInput.focus();
    return;
}


if (newPassword !== confirmPassword) {

    showToast(
        "New password and confirmation do not match.",
        true
    );

    confirmPasswordInput.focus();
    return;
}


if (currentPassword === newPassword) {

    showToast(
        "New password must be different from your current password.",
        true
    );

    newPasswordInput.focus();
    return;
}


const originalButtonText =
    submitButton
        ? submitButton.textContent
        : "Change Password";


try {

    if (submitButton) {

        submitButton.disabled = true;

        submitButton.textContent =
            "Changing Password...";
    }


    /*
     * IMPORTANT:
     *
     * The backend expects all three values:
     *
     * current_password
     * new_password
     * confirm_password
     */

    const response = await apiRequest(
        `${API_URL}/users/me/password`,
        {
            method: "PUT",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword,
                confirm_password: confirmPassword
            })
        }
    );


    if (!response) {
        return;
    }


    const data =
        await readResponseData(response);


    if (!response.ok) {

        throw new Error(
            getApiErrorMessage(
                data,
                "Unable to change your password."
            )
        );
    }


    closeChangePasswordModal();


    showToast(
        "Password changed successfully."
    );


} catch (error) {

    console.error(
        "Change password error:",
        error
    );


    showToast(
        error.message ||
        "Unable to change your password.",
        true
    );


} finally {

    if (submitButton) {

        submitButton.disabled = false;

        submitButton.textContent =
            originalButtonText;
    }
}
}
/* ============================================================
RESPONSE DATA HELPER
============================================================ */
async function readResponseData(response) {
const contentType =
    response.headers.get(
        "content-type"
    ) || "";


if (
    contentType.includes(
        "application/json"
    )
) {

    try {
        return await response.json();
    } catch (error) {
        return null;
    }
}


try {

    const text =
        await response.text();

    if (!text) {
        return null;
    }

    return {
        detail: text
    };

} catch (error) {

    return null;
}
}
/* ============================================================
API ERROR MESSAGE
============================================================ */
function getApiErrorMessage(
data,
fallback
) {
if (!data) {
    return fallback;
}


if (typeof data.detail === "string") {
    return data.detail;
}


if (Array.isArray(data.detail)) {

    return data.detail
        .map(function (item) {

            if (
                item &&
                typeof item.msg === "string"
            ) {
                return item.msg;
            }

            return "";
        })
        .filter(Boolean)
        .join(", ");
}


if (typeof data.message === "string") {
    return data.message;
}


return fallback;
}
/* ============================================================
PASSWORD MODAL STYLES
============================================================ */
function addPasswordModalStyles() {
if (
    document.getElementById(
        "passwordModalStyles"
    )
) {
    return;
}


const style =
    document.createElement("style");

style.id = "passwordModalStyles";


style.textContent = `

    body.password-modal-open {
        overflow: hidden;
    }

    #changePasswordModal {
        display: none;
    }

    #changePasswordModal.open {
        display: block;
    }

    .password-modal-overlay {
        position: fixed;
        inset: 0;
        z-index: 5000;
        background: rgba(15, 39, 29, 0.48);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        backdrop-filter: blur(2px);
    }

    .password-modal {
        width: min(100%, 500px);
        max-height: calc(100vh - 40px);
        overflow-y: auto;
        background: #ffffff;
        border: 1px solid #e1e9e4;
        border-radius: 14px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.18);
        animation: passwordModalIn 0.2s ease;
    }

    @keyframes passwordModalIn {

        from {
            opacity: 0;
            transform: translateY(12px) scale(0.98);
        }

        to {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
    }

    .password-modal-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 20px;
        padding: 22px 24px;
        border-bottom: 1px solid #e8eeeb;
    }

    .password-modal-header h2 {
        margin: 0;
        color: #17352a;
        font-size: 18px;
        font-weight: 700;
    }

    .password-modal-header p {
        margin: 6px 0 0;
        color: #788880;
        font-size: 12px;
        line-height: 1.5;
    }

    .password-modal-close {
        width: 34px;
        height: 34px;
        border: none;
        border-radius: 7px;
        background: transparent;
        color: #71827a;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .password-modal-close:hover {
        background: #f0f5f2;
        color: #17352a;
    }

    .password-modal-close svg {
        width: 18px;
        height: 18px;
    }

    .password-modal-body {
        padding: 24px;
    }

    .password-field {
        display: flex;
        flex-direction: column;
        gap: 7px;
        margin-bottom: 18px;
    }

    .password-field:last-child {
        margin-bottom: 0;
    }

    .password-field label {
        color: #344c41;
        font-size: 12px;
        font-weight: 600;
    }

    .password-input-wrapper {
        position: relative;
    }

    .password-input-wrapper input {
        width: 100%;
        height: 42px;
        padding: 0 45px 0 12px;
        border: 1px solid #dce5e0;
        border-radius: 7px;
        background: #ffffff;
        color: #243d32;
        font-size: 13px;
        outline: none;
        transition:
            border-color 0.2s ease,
            box-shadow 0.2s ease;
    }

    .password-input-wrapper input:focus {
        border-color: #4c8068;
        box-shadow: 0 0 0 3px rgba(76, 128, 104, 0.08);
    }

    .password-input-wrapper input::placeholder {
        color: #a0aaa5;
    }

    .password-toggle {
        position: absolute;
        right: 5px;
        top: 50%;
        transform: translateY(-50%);
        width: 34px;
        height: 34px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: #71827a;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .password-toggle:hover {
        background: #f0f5f2;
        color: #245f45;
    }

    .password-toggle svg {
        width: 17px;
        height: 17px;
    }

    .password-help {
        color: #8a9891;
        font-size: 11px;
    }

    .password-modal-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 10px;
        padding: 18px 24px 22px;
        border-top: 1px solid #e8eeeb;
    }

    .password-modal-actions .btn:disabled {
        opacity: 0.65;
        cursor: not-allowed;
    }

    @media (max-width: 550px) {

        .password-modal-overlay {
            align-items: flex-end;
            padding: 0;
        }

        .password-modal {
            width: 100%;
            max-height: 92vh;
            border-radius: 14px 14px 0 0;
        }

        .password-modal-header,
        .password-modal-body {
            padding-left: 18px;
            padding-right: 18px;
        }

        .password-modal-actions {
            padding-left: 18px;
            padding-right: 18px;
        }

        .password-modal-actions .btn {
            flex: 1;
        }
    }
`;


document.head.appendChild(style);
}
/* ============================================================
NOTIFICATIONS
============================================================ */
function setupNotificationSettings() {
const notificationIds = [
    "budgetAlerts",
    "goalReminders",
    "weeklySummary",
    "transactionNotifications"
];


notificationIds.forEach(function (id) {

    const checkbox =
        document.getElementById(id);

    if (!checkbox) {
        return;
    }


    checkbox.addEventListener(
        "change",
        function () {

            saveNotifications();

            showToast(
                "Notification settings updated."
            );
        }
    );
});
}
/* ============================================================
LOAD NOTIFICATIONS
============================================================ */
function loadSavedNotifications() {
const saved =
    localStorage.getItem(
        "budgetwise_notifications"
    );


if (!saved) {
    return;
}


try {

    const settings =
        JSON.parse(saved);


    Object.keys(settings).forEach(
        function (key) {

            const checkbox =
                document.getElementById(key);

            if (checkbox) {
                checkbox.checked =
                    Boolean(settings[key]);
            }
        }
    );

} catch (error) {

    console.error(
        "Unable to load notification settings:",
        error
    );
}
}
/* ============================================================
SAVE NOTIFICATIONS
============================================================ */
function saveNotifications() {
const notificationIds = [
    "budgetAlerts",
    "goalReminders",
    "weeklySummary",
    "transactionNotifications"
];


const settings = {};


notificationIds.forEach(function (id) {

    const checkbox =
        document.getElementById(id);

    if (checkbox) {
        settings[id] =
            checkbox.checked;
    }
});


localStorage.setItem(
    "budgetwise_notifications",
    JSON.stringify(settings)
);
}
/* ============================================================
PREFERENCES
============================================================ */
function setupPreferences() {
const saveButton =
    document.getElementById(
        "preferencesSaveBtn"
    );

const resetButton =
    document.getElementById(
        "preferencesResetBtn"
    );


if (saveButton) {

    saveButton.addEventListener(
        "click",
        function () {

            savePreferences();

            showToast(
                "Preferences saved successfully."
            );
        }
    );
}


if (resetButton) {

    resetButton.addEventListener(
        "click",
        function () {

            resetPreferences();

            showToast(
                "Preferences reset."
            );
        }
    );
}
}
/* ============================================================
LOAD PREFERENCES
============================================================ */
function loadSavedPreferences() {
const saved =
    localStorage.getItem(
        "budgetwise_preferences"
    );


if (!saved) {
    return;
}


try {

    const preferences =
        JSON.parse(saved);


    const currency =
        document.getElementById(
            "currency"
        );

    const dateFormat =
        document.getElementById(
            "dateFormat"
        );

    const startOfWeek =
        document.getElementById(
            "startOfWeek"
        );

    const decimalPlaces =
        document.getElementById(
            "decimalPlaces"
        );


    if (
        currency &&
        preferences.currency
    ) {
        currency.value =
            preferences.currency;
    }


    if (
        dateFormat &&
        preferences.dateFormat
    ) {
        dateFormat.value =
            preferences.dateFormat;
    }


    if (
        startOfWeek &&
        preferences.startOfWeek
    ) {
        startOfWeek.value =
            preferences.startOfWeek;
    }


    if (
        decimalPlaces &&
        preferences.decimalPlaces
    ) {
        decimalPlaces.value =
            preferences.decimalPlaces;
    }

} catch (error) {

    console.error(
        "Unable to load preferences:",
        error
    );
}
}
/* ============================================================
SAVE PREFERENCES
============================================================ */
function savePreferences() {
const currency =
    document.getElementById(
        "currency"
    );

const dateFormat =
    document.getElementById(
        "dateFormat"
    );

const startOfWeek =
    document.getElementById(
        "startOfWeek"
    );

const decimalPlaces =
    document.getElementById(
        "decimalPlaces"
    );


const preferences = {

    currency:
        currency
            ? currency.value
            : "NGN",

    dateFormat:
        dateFormat
            ? dateFormat.value
            : "DD/MM/YYYY",

    startOfWeek:
        startOfWeek
            ? startOfWeek.value
            : "monday",

    decimalPlaces:
        decimalPlaces
            ? decimalPlaces.value
            : "2"
};


localStorage.setItem(
    "budgetwise_preferences",
    JSON.stringify(preferences)
);
}
/* ============================================================
RESET PREFERENCES
============================================================ */
function resetPreferences() {
const currency =
    document.getElementById(
        "currency"
    );

const dateFormat =
    document.getElementById(
        "dateFormat"
    );

const startOfWeek =
    document.getElementById(
        "startOfWeek"
    );

const decimalPlaces =
    document.getElementById(
        "decimalPlaces"
    );


if (currency) {
    currency.value = "NGN";
}

if (dateFormat) {
    dateFormat.value =
        "DD/MM/YYYY";
}

if (startOfWeek) {
    startOfWeek.value =
        "monday";
}

if (decimalPlaces) {
    decimalPlaces.value = "2";
}


savePreferences();
}
/* ============================================================
SEARCH
============================================================ */
function setupSearch() {
const searchInput =
    document.getElementById(
        "searchInput"
    );


if (!searchInput) {
    return;
}


searchInput.addEventListener(
    "input",
    function () {

        const query =
            searchInput.value
                .trim()
                .toLowerCase();


        if (!query) {
            return;
        }


        const tabs =
            document.querySelectorAll(
                ".settings-tab"
            );


        tabs.forEach(function (tab) {

            const text =
                tab.textContent
                    .trim()
                    .toLowerCase();

            if (text.includes(query)) {

                tab.style.outline =
                    "2px solid rgba(47,121,88,0.18)";

            } else {

                tab.style.outline =
                    "none";
            }
        });
    }
);
}
/* ============================================================
NOTIFICATION BUTTON
============================================================ */
function setupNotificationButton() {
const button =
    document.getElementById(
        "notificationBtn"
    );


if (!button) {
    return;
}


button.addEventListener(
    "click",
    function () {

        showToast(
            "You are all caught up."
        );
    }
);
}
/* ============================================================
MOBILE MENU
============================================================ */
function setupMobileMenu() {
const button =
    document.getElementById(
        "mobileMenu"
    );

const sidebar =
    document.getElementById(
        "sidebar"
    );


if (!button || !sidebar) {
    return;
}


button.addEventListener(
    "click",
    function () {

        sidebar.classList.toggle("open");
    }
);


document.addEventListener(
    "click",
    function (event) {

        if (
            window.innerWidth > 900
        ) {
            return;
        }


        const clickedInsideSidebar =
            sidebar.contains(event.target);

        const clickedMenuButton =
            button.contains(event.target);


        if (
            !clickedInsideSidebar &&
            !clickedMenuButton
        ) {

            sidebar.classList.remove(
                "open"
            );
        }
    }
);
}
/* ============================================================
TOAST
============================================================ */
function showToast(
message,
isError = false
) {
const toast =
    document.getElementById(
        "toast"
    );


if (!toast) {
    return;
}


if (toastTimer) {
    clearTimeout(toastTimer);
}


toast.textContent = message;


toast.classList.remove(
    "error"
);


if (isError) {
    toast.classList.add("error");
}


toast.classList.add("show");


toastTimer = setTimeout(
    function () {

        toast.classList.remove(
            "show"
        );

    },
    3500
);
}
/* ============================================================
LUCIDE ICONS
============================================================ */
function refreshIcons() {
if (
    window.lucide &&
    typeof window.lucide.createIcons ===
        "function"
) {

    window.lucide.createIcons();
}
}

/* ============================================================
   MONTHLY FINANCIAL REPORT EMAIL PREFERENCE
   Saved on the backend, rather than in localStorage, so that
   the scheduler can honour the choice after the browser closes.
   ============================================================ */

async function setupMonthlyEmailPreference() {
    const checkbox = document.getElementById("monthlyReportsEmail");
    if (!checkbox) return;

    checkbox.disabled = true;
    try {
        const response = await apiRequest(
            API_URL + "/users/me/monthly-email",
            {method: "GET"}
        );
        if (!response || !response.ok) {
            throw new Error("Could not load monthly email preference");
        }
        const preference = await response.json();
        checkbox.checked = preference.monthly_reports_enabled === true;
        checkbox.disabled = false;
    } catch (error) {
        showToast(error.message, true);
        return;
    }

    checkbox.addEventListener("change", async () => {
        const intended = checkbox.checked;
        checkbox.disabled = true;
        try {
            const response = await apiRequest(
                API_URL + "/users/me/monthly-email",
                {
                    method: "PUT",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({monthly_reports_enabled: intended})
                }
            );
            if (!response || !response.ok) {
                throw new Error("Could not update monthly email preference");
            }
            const result = await response.json();
            checkbox.checked = result.monthly_reports_enabled === true;
            showToast(checkbox.checked
                ? "Monthly email reports enabled."
                : "Monthly email reports disabled.");
        } catch (error) {
            checkbox.checked = !intended;
            showToast(error.message, true);
        } finally {
            checkbox.disabled = false;
        }
    });
}

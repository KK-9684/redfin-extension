// Saves options to chrome.storage
function save_options(ev) {
    const form = ev.target;
    let reqBody = {};
    Object.keys(form.elements).forEach(key => {
        if (isNaN(key)) {
            let element = form.elements[key];
            if (element.type !== "submit") {
                reqBody[element.name] = element.value;
            }
        }
    });
    chrome.storage.sync.set(reqBody, function () {
        alert('Options saved, please reload the page used extension');
    });
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restore_options() {
    debugger
    // Use default value color = 'red' and likesColor = true.
    chrome.storage.sync.get({
        small_rehab: '4',
        med_rehab: '8',
        big_rehab: '15'
    }, function (items) {
        document.getElementById('color').value = items.favoriteColor;
        document.getElementById('like').checked = items.likesColor;
    });
}
document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('form_option').addEventListener('submit',
    save_options);
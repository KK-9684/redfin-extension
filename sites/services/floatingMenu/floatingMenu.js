export class FloatingMenu {

  constructor(appendTo) {
    this.initFloatingMenu(appendTo);
  }

  initFloatingMenu(appendTo) {
    const floatingMenu = `<div class="imh-floating-menu">
            <input type="checkbox">
            <span class="menu-icon">
                <span aria-hidden="true">
                <svg style="width:24px;height:24px" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z" />
                </svg>
                </span>
            </span>
            <ul class="imh-floating-nav">
                
            </ul>
        </div>`;

    appendTo.append(floatingMenu);
  }

  addItemToFloatingMenu(classes, icon, callback, id) {
    const item = $(`<li></li>`);
    if (id) {
      item.attr('id',id);
    }

    const menuButton = document.createElement('button');
    menuButton.classList.add(classes);
    menuButton.classList.add('imh-floating-menu-item-button');
    menuButton.innerHTML = icon;
    menuButton.addEventListener('click', callback);

    item.append($('<span></span>').append(menuButton));
    item.append($('<span class="imh-floating-menu-item-loading-icon imh-rotating"></span>').append($(`
      <svg style="width:24px;height:24px" viewBox="0 0 24 24">
          <path fill="currentColor" d="M12,4V2A10,10 0 0,0 2,12H4A8,8 0 0,1 12,4Z" />
      </svg>
    `)));
    $('.imh-floating-nav').append(item);
  }

  updateButtonLoading(id, val) {
    const button = $(`#${id}`);
    if (button.length) {
      if (val) {
        button.addClass('imh-is-loading');
      } else {
        button.removeClass('imh-is-loading');
      }
    }
  }
}
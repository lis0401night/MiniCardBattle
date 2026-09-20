"""
Deploy refined Cthulhu (Nyia) summer skin assets to production.
Follows docs/CHARACTER_ASSET_WORKFLOW.md:
1. Standing artwork: public/assets/characters/char_cthulhu_summer.webp (800x1200, WebP Q90)
2. Playmat board: public/assets/boards/board_cthulhu_summer.webp (400x200, WebP Q90)
3. Normal icon: public/assets/icons/icon_cthulhu_summer.webp (200x200, radius 96 circle alpha, WebP Q90)
4. Damage icon: public/assets/icons/icon_cthulhu_summer_damage.webp (200x200, seamless feather blend, WebP Q90)
"""

import cv2
import numpy as np
from PIL import Image

def deploy():
    # 1. Standing Artwork
    char_bgr = cv2.imread('C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/redrawn_candidate_A.png')
    char_rgb = cv2.cvtColor(char_bgr, cv2.COLOR_BGR2RGB)
    pil_char = Image.fromarray(char_rgb)
    pil_char.save('public/assets/characters/char_cthulhu_summer.webp', 'WEBP', quality=90)
    print('1. Saved public/assets/characters/char_cthulhu_summer.webp')

    # 2. Playmat Board
    # SSD coordinates: left=48, top=160, width=704, height=352 -> resize to 400x200
    board_crop = char_bgr[160:160+352, 48:48+704]
    board_200 = cv2.resize(board_crop, (400, 200), interpolation=cv2.INTER_AREA)
    board_rgb = cv2.cvtColor(board_200, cv2.COLOR_BGR2RGB)
    pil_board = Image.fromarray(board_rgb)
    pil_board.save('public/assets/boards/board_cthulhu_summer.webp', 'WEBP', quality=90)
    print('2. Saved public/assets/boards/board_cthulhu_summer.webp')

    # 3. Normal Icon
    # SSD coordinates: left=286, top=172, size=260 -> resize to 200x200
    icon_crop = char_bgr[172:172+260, 286:286+260]
    icon_200 = cv2.resize(icon_crop, (200, 200), interpolation=cv2.INTER_AREA)

    # Circle alpha mask (center 100, 100, radius 96)
    alpha_mask = np.zeros((200, 200), dtype=np.uint8)
    cv2.circle(alpha_mask, (100, 100), 96, 255, -1)
    alpha_mask = cv2.GaussianBlur(alpha_mask, (3, 3), 0)

    icon_rgba = cv2.cvtColor(icon_200, cv2.COLOR_BGR2RGBA)
    icon_rgba[:, :, 3] = alpha_mask
    pil_icon_normal = Image.fromarray(icon_rgba)
    pil_icon_normal.save('public/assets/icons/icon_cthulhu_summer.webp', 'WEBP', quality=90)
    print('3. Saved public/assets/icons/icon_cthulhu_summer.webp')

    # 4. Damage Icon
    damage_img = cv2.imread('C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/cthulhu_summer_damage_face_1789905629633.jpg')
    scale = 0.26
    w_d = int(1024 * scale)
    h_d = int(1024 * scale)
    d_scaled = cv2.resize(damage_img, (w_d, h_d), interpolation=cv2.INTER_AREA)
    left = (w_d - 200) // 2 + 4
    top = (h_d - 200) // 2 + 1
    crop_d = d_scaled[top:top+200, left:left+200]

    # Mask covering both eyes and mouth: center=(100, 115), rx=52, ry=38
    mask = np.zeros((200, 200), dtype=np.float32)
    cv2.ellipse(mask, (100, 115), (52, 38), 0, 0, 360, 1.0, -1)
    mask = cv2.GaussianBlur(mask, (21, 21), 0)
    mask_3d = np.repeat(mask[:, :, np.newaxis], 3, axis=2)

    blended_damage = (icon_200.astype(np.float32) * (1.0 - mask_3d) + crop_d.astype(np.float32) * mask_3d)
    blended_damage = np.clip(blended_damage, 0, 255).astype(np.uint8)

    damage_rgba = cv2.cvtColor(blended_damage, cv2.COLOR_BGR2RGBA)
    damage_rgba[:, :, 3] = alpha_mask
    pil_icon_damage = Image.fromarray(damage_rgba)
    pil_icon_damage.save('public/assets/icons/icon_cthulhu_summer_damage.webp', 'WEBP', quality=90)
    print('4. Saved public/assets/icons/icon_cthulhu_summer_damage.webp')

    print('All summer assets deployed successfully!')

if __name__ == '__main__':
    deploy()

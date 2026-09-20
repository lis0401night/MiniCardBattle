"""
Apply Option 3 (top=138) to Cthulhu summer normal and damage icons.
Follows docs/CHARACTER_ASSET_WORKFLOW.md:
1. Normal icon: crop from char_cthulhu_summer.webp at left=286, top=138, size=260 -> resize 200x200, apply circle alpha (R=96).
2. Damage icon: composite damage expression face onto normal icon base via smooth feather blend -> apply circle alpha (R=96).
"""

import cv2
import numpy as np
from PIL import Image

def apply_option_3():
    # 1. Normal Icon
    char_bgr = cv2.imread('public/assets/characters/char_cthulhu_summer.webp')
    
    top_val = 138
    left_val = 286
    size_val = 260
    
    crop_n = char_bgr[top_val:top_val+size_val, left_val:left_val+size_val]
    icon_200 = cv2.resize(crop_n, (200, 200), interpolation=cv2.INTER_AREA)

    # Circular mask (center 100, 100, radius 96)
    alpha_mask = np.zeros((200, 200), dtype=np.uint8)
    cv2.circle(alpha_mask, (100, 100), 96, 255, -1)
    alpha_mask = cv2.GaussianBlur(alpha_mask, (3, 3), 0)

    normal_rgba = cv2.cvtColor(icon_200, cv2.COLOR_BGR2RGBA)
    normal_rgba[:, :, 3] = alpha_mask
    pil_normal = Image.fromarray(normal_rgba)
    pil_normal.save('public/assets/icons/icon_cthulhu_summer.webp', 'WEBP', quality=90)
    print('1. Saved public/assets/icons/icon_cthulhu_summer.webp with top=138')

    # 2. Damage Icon
    damage_img = cv2.imread('C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/cthulhu_summer_damage_face_1789905629633.jpg')
    scale = 0.26
    w_d = int(1024 * scale)
    h_d = int(1024 * scale)
    d_scaled = cv2.resize(damage_img, (w_d, h_d), interpolation=cv2.INTER_AREA)

    # Shift for top=138:
    shift_y = int(round((top_val - 172) * (200.0 / 260.0)))
    left_d = (w_d - 200) // 2 + 4
    top_d = (h_d - 200) // 2 + 1 + shift_y
    crop_d = d_scaled[top_d:top_d+200, left_d:left_d+200]

    # Mask covering eyes and mouth:
    mask_cy = 115 - shift_y
    mask = np.zeros((200, 200), dtype=np.float32)
    cv2.ellipse(mask, (100, mask_cy), (52, 38), 0, 0, 360, 1.0, -1)
    mask = cv2.GaussianBlur(mask, (21, 21), 0)
    mask_3d = np.repeat(mask[:, :, np.newaxis], 3, axis=2)

    blended_d = (icon_200.astype(np.float32) * (1.0 - mask_3d) + crop_d.astype(np.float32) * mask_3d)
    blended_d = np.clip(blended_d, 0, 255).astype(np.uint8)

    damage_rgba = cv2.cvtColor(blended_d, cv2.COLOR_BGR2RGBA)
    damage_rgba[:, :, 3] = alpha_mask
    pil_damage = Image.fromarray(damage_rgba)
    pil_damage.save('public/assets/icons/icon_cthulhu_summer_damage.webp', 'WEBP', quality=90)
    print('2. Saved public/assets/icons/icon_cthulhu_summer_damage.webp with top=138')

    print('Successfully applied Option 3 icons!')

if __name__ == '__main__':
    apply_option_3()

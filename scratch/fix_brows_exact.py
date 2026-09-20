"""
Fix blurry eyebrows on Cthulhu summer skin.
Root cause identified:
1. In Summer skin, a semi-transparent purple/brown eyebrow overlay was placed ON TOP of the bangs (y: 268..290, x: 422..450), making it look like a muddy/blurry stain on the hair.
2. In Default skin (char_cthulhu.webp), the bangs fall in FRONT of the eyebrow with zero overlay on the hair strand. The eyebrow is a sharp, confident black/dark-purple ink line on the exposed forehead skin to the left of the bangs, naturally disappearing behind the hair strand.
3. Character's right brow (screen left) also had blurred contours under the hair strand.

Solution:
1. Seamlessly restore the deep purple glossy hair texture of the bangs, removing the blurry overlay on top of the hair.
2. Render crisp, razor-sharp anime ink line eyebrows on the exposed forehead skin, exactly matching the style and confident arch of the Default skin.
3. Provide options:
   - Candidate A: Default-style (eyebrow naturally disappears behind the bangs strand - cleanest, exactly like default skin).
   - Candidate B: Sharp anime cut (crisp, razor-thin eyebrow line visible across the hair with zero blur/muddiness).
   - Candidate C: Natural arch with refined tip extending past the bangs.
"""

import cv2
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance

def fix_brows():
    # Base candidates from previous turn
    c1 = cv2.imread('C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/cthulhu_summer_candidate_1.png')
    c2 = cv2.imread('C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/cthulhu_summer_candidate_2.png')
    def_img = cv2.imread('e:/project_arakia/projects/MiniCardBattle/public/assets/characters/char_cthulhu.webp')

    def restore_hair_and_draw_brows(base_img, mode='default_natural'):
        img = base_img.copy()

        # Step 1: Clean up the muddy translucent eyebrow stain on the bangs
        # The bangs strand is located at x: 420..448, y: 268..295
        # Clean hair directly above it (y: 250..266, x: 420..448) has glossy purple hair flow
        # Clean hair directly below it (y: 295..315, x: 420..448) has dark purple hair flow
        
        # Create mask for the dirty patch on the bangs strand
        dirty_mask = np.zeros((1200, 800), dtype=np.uint8)
        pts_dirty = np.array([
            [423, 270],
            [448, 268],
            [445, 292],
            [422, 294]
        ], np.int32)
        cv2.fillPoly(dirty_mask, [pts_dirty], 255)

        # Inpaint to seamlessly blend hair texture from surrounding bangs
        cleaned_hair = cv2.inpaint(img, dirty_mask, inpaintRadius=4, flags=cv2.INPAINT_TELEA)

        # Also add subtle directional vertical hair gradient to match surrounding strands perfectly
        for x in range(422, 448):
            for y in range(268, 294):
                if dirty_mask[y, x] > 0:
                    # Vertical interpolation of hair color
                    t = (y - 268) / (294 - 268)
                    c_top = cleaned_hair[265, x].astype(np.float32)
                    c_bot = cleaned_hair[296, x].astype(np.float32)
                    target_color = c_top * (1.0 - t) + c_bot * t
                    cleaned_hair[y, x] = np.clip(cleaned_hair[y, x] * 0.3 + target_color * 0.7, 0, 255).astype(np.uint8)

        # Step 2: Draw razor-sharp eyebrows
        # Default skin eyebrow color: dark purple-black [28, 18, 26] (BGR)
        brow_bgr = (28, 18, 26)

        # Create high-res 4x supersampled layer for sub-pixel anti-aliasing
        scale = 4
        h, w = 1200 * scale, 800 * scale
        brow_canvas = np.zeros((h, w, 4), dtype=np.uint8)

        # Coordinates on character's left brow (screen top-right):
        # Exposed forehead skin is at x: 404..422, y: 275..290
        # Forehead brow segment: arch rising from x=404, y=289 to x=421, y=278
        pts_left_forehead = np.array([
            [403 * scale, 290 * scale],
            [413 * scale, 283 * scale],
            [422 * scale, 277 * scale],
            [422 * scale, 274 * scale],
            [412 * scale, 280 * scale],
            [403 * scale, 288 * scale],
        ], np.int32)
        cv2.fillPoly(brow_canvas, [pts_left_forehead], (*brow_bgr, 255))

        # Character's right brow (screen top-left):
        # Exposed forehead skin at x: 370..392, y: 282..296
        # Arch rising from x=370, y=295 to x=390, y=284, then tucked behind bangs
        pts_right_forehead = np.array([
            [368 * scale, 297 * scale],
            [378 * scale, 289 * scale],
            [390 * scale, 283 * scale],
            [390 * scale, 280 * scale],
            [378 * scale, 286 * scale],
            [368 * scale, 295 * scale],
        ], np.int32)
        cv2.fillPoly(brow_canvas, [pts_right_forehead], (*brow_bgr, 255))

        if mode == 'default_natural':
            # Exactly like default skin:
            # The eyebrow cleanly disappears behind the thick bangs strand!
            # No muddy overlay on top of the hair.
            pass

        elif mode == 'extended_tip':
            # The tip of the brow cleanly re-emerges to the right of the bangs strand (x: 447..458, y: 268..273)
            # as a razor-sharp tapered flick, completely clean!
            pts_left_tip = np.array([
                [448 * scale, 273 * scale],
                [456 * scale, 269 * scale],
                [459 * scale, 266 * scale],
                [456 * scale, 267 * scale],
                [448 * scale, 271 * scale],
            ], np.int32)
            cv2.fillPoly(brow_canvas, [pts_left_tip], (*brow_bgr, 255))

        elif mode == 'subtle_crisp_overlay':
            # If the user wants to see the brow line across the bangs, make it an ultra-crisp, razor-thin 1px anime line (NO blurry smudge)
            pts_hair_line = np.array([
                [422 * scale, 275 * scale],
                [435 * scale, 271 * scale],
                [448 * scale, 267 * scale],
                [448 * scale, 266 * scale],
                [435 * scale, 270 * scale],
                [422 * scale, 274 * scale],
            ], np.int32)
            cv2.fillPoly(brow_canvas, [pts_hair_line], (*brow_bgr, 160)) # semi-transparent crisp line

        # Downsample brow layer with AREA interpolation for perfect anti-aliasing
        brow_layer = cv2.resize(brow_canvas, (800, 1200), interpolation=cv2.INTER_AREA)

        # Alpha composite
        alpha = (brow_layer[:, :, 3] / 255.0)[:, :, np.newaxis]
        result = (cleaned_hair.astype(np.float32) * (1.0 - alpha) + brow_layer[:, :, :3].astype(np.float32) * alpha)
        result = np.clip(result, 0, 255).astype(np.uint8)

        # Clean up any residual smudgy shadows under the character's right eye/brow
        # Subtle unsharp mask on eye/brow area
        pil_res = Image.fromarray(cv2.cvtColor(result, cv2.COLOR_BGR2RGB))
        eye_crop = pil_res.crop((350, 260, 500, 340))
        eye_sharp = eye_crop.filter(ImageFilter.UnsharpMask(radius=1.0, percent=130, threshold=1))
        pil_res.paste(eye_sharp, (350, 260))

        return cv2.cvtColor(np.array(pil_res), cv2.COLOR_RGB2BGR)

    # Generate 3 candidates:
    # Option 1: Default Natural (眉毛が前髪の裏に自然に隠れ、滲みが100%消失する通常スキン完全一致形式)
    opt1 = restore_hair_and_draw_brows(c1, 'default_natural')
    cv2.imwrite('C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/cthulhu_summer_brow_fix_opt1.png', opt1)

    # Option 2: Extended Tip (前髪の裏を通って右側にシャープな眉尻がスッと抜ける形式)
    opt2 = restore_hair_and_draw_brows(c1, 'extended_tip')
    cv2.imwrite('C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/cthulhu_summer_brow_fix_opt2.png', opt2)

    # Option 3: Subtle Crisp Overlay (前髪を横切る極細のクリスプなアニメ描画線・滲みゼロ形式)
    opt3 = restore_hair_and_draw_brows(c1, 'subtle_crisp_overlay')
    cv2.imwrite('C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/cthulhu_summer_brow_fix_opt3.png', opt3)

    print('Brow fix options generated successfully.')

if __name__ == '__main__':
    fix_brows()

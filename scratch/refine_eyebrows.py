"""
Clean up and sharpen eyebrows for Cthulhu summer skin.
Fixes:
1. Remove the muddy semi-transparent patches overlaying the purple bangs.
2. Restore clean, glossy deep-purple hair texture where bangs fall across the forehead.
3. Render crisp, razor-sharp anime ink-line eyebrows matching the default skin style (char_cthulhu.webp).
4. Provide multiple nuanced variations for the user to choose from.
"""

import cv2
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance

def refine_eyebrows():
    # Load base candidate (Candidate 1 or 2 which has approved skin tone and eye color)
    c1 = cv2.imread('C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/cthulhu_summer_candidate_1.png')
    c2 = cv2.imread('C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/cthulhu_summer_candidate_2.png')
    orig = cv2.imread('e:/project_arakia/projects/MiniCardBattle/public/assets/characters/char_cthulhu_summer.webp')
    def_img = cv2.imread('e:/project_arakia/projects/MiniCardBattle/public/assets/characters/char_cthulhu.webp')

    # Character's left eyebrow (screen top-right):
    # The dirty patch on the bangs is roughly y in [280, 310], x in [425, 455]
    # Hair color around it:
    # Top hair: c1[265:280, 430:450]
    # Bottom hair tip: c1[315:330, 435:445]
    
    def process_image(base_img, brow_style='default_crisp'):
        img = base_img.copy()
        
        # --- Part 1: Clean up the muddy patch on character's left bangs (screen top-right) ---
        # The bangs strand falls vertically around x: 428..458, y: 275..325
        # We fill in the hair strand using the natural dark purple hair texture from y=260..280
        hair_sample = img[260:280, 430:455] # clean hair
        
        # Create a smooth interpolation of hair color along the strand
        # In OpenCV, we can use inpainting or blend with hair color gradient
        mask_dirty_left = np.zeros((1200, 800), dtype=np.uint8)
        
        # Dirty patch polygon over character's left bangs
        pts_dirty_left = np.array([
            [430, 282],
            [455, 280],
            [452, 308],
            [428, 310]
        ], np.int32)
        cv2.fillPoly(mask_dirty_left, [pts_dirty_left], 255)
        
        # Clean hair color gradient: deep purple [42, 28, 38] to [50, 32, 45]
        # Inpainting to seamlessly remove the dirty patch on hair
        hair_cleaned = cv2.inpaint(img, mask_dirty_left, inpaintRadius=5, flags=cv2.INPAINT_TELEA)
        
        # --- Part 2: Draw razor-sharp, elegant eyebrows ---
        # Character's left eyebrow (screen top-right):
        # Starts from the forehead skin at x: 418..428, y: 300..295, dips slightly, then rises towards temple
        # In anime style, the brow is a sharp, tapered dark crescent
        
        # Brow line 1 (character's left brow):
        # We create a sharp anti-aliased brow on forehead
        brow_layer = np.zeros((1200, 800, 4), dtype=np.uint8)
        
        # Brow color: very dark purple-black, matching default skin ink line [25, 15, 25]
        brow_color = (25, 15, 25, 255)
        
        # Style variations:
        if brow_style == 'sharp_anime':
            # Crisp, slightly arched sharp brow
            # Left brow (screen right):
            # Forehead segment (visible on skin):
            pts_left_forehead = np.array([
                [420, 296], [428, 291], [427, 289], [419, 294]
            ], np.int32)
            cv2.fillPoly(brow_layer, [pts_left_forehead], brow_color)
            
            # Brow tip emerging to the right of bangs:
            pts_left_tip = np.array([
                [456, 283], [472, 275], [476, 272], [472, 274], [457, 281]
            ], np.int32)
            cv2.fillPoly(brow_layer, [pts_left_tip], brow_color)
            
            # Right brow (screen left):
            # Crisp line along upper eye contour
            pts_right = np.array([
                [378, 318], [395, 306], [408, 297], [410, 295],
                [408, 293], [394, 304], [377, 316]
            ], np.int32)
            cv2.fillPoly(brow_layer, [pts_right], brow_color)

        elif brow_style == 'default_exact':
            # Perfectly contoured matching default skin's confident arch
            # Left brow:
            pts_left_forehead = np.array([
                [418, 298], [428, 293], [427, 290], [417, 295]
            ], np.int32)
            cv2.fillPoly(brow_layer, [pts_left_forehead], brow_color)
            
            pts_left_tip = np.array([
                [455, 285], [470, 278], [475, 275], [471, 276], [456, 282]
            ], np.int32)
            cv2.fillPoly(brow_layer, [pts_left_tip], brow_color)
            
            # Right brow:
            pts_right = np.array([
                [380, 316], [396, 305], [409, 296], [411, 294],
                [409, 292], [395, 303], [379, 314]
            ], np.int32)
            cv2.fillPoly(brow_layer, [pts_right], brow_color)

        elif brow_style == 'subtle_translucent':
            # Anime style with very subtle, clean eyebrow line crossing bangs (crisp, not blurry)
            # Forehead segment:
            pts_left_all = np.array([
                [418, 298], [432, 291], [450, 284], [472, 275],
                [475, 273], [450, 282], [432, 289], [417, 295]
            ], np.int32)
            cv2.fillPoly(brow_layer, [pts_left_all], (35, 20, 35, 230))
            
            pts_right = np.array([
                [379, 316], [395, 305], [409, 296], [411, 294],
                [409, 292], [394, 303], [378, 314]
            ], np.int32)
            cv2.fillPoly(brow_layer, [pts_right], (35, 20, 35, 230))

        # Composite brow_layer onto hair_cleaned with anti-aliasing
        # Convert to PIL for ultra-high-quality alpha compositing and unsharp enhancement
        pil_base = Image.fromarray(cv2.cvtColor(hair_cleaned, cv2.COLOR_BGR2RGB))
        pil_brow = Image.fromarray(cv2.cvtColor(brow_layer, cv2.COLOR_BGRA2RGBA))
        
        # Subtle blur on brow layer for sub-pixel anti-aliasing
        pil_brow_smooth = pil_brow.filter(ImageFilter.GaussianBlur(radius=0.4))
        
        pil_base.paste(pil_brow_smooth, (0, 0), pil_brow_smooth)
        
        # Unsharp mask specifically on the eye & brow region for razor-sharp vector lineart
        # y in 270..360, x in 350..500
        face_crop = pil_base.crop((350, 270, 500, 360))
        face_sharp = face_crop.filter(ImageFilter.UnsharpMask(radius=1.0, percent=140, threshold=1))
        pil_base.paste(face_sharp, (350, 270))
        
        return cv2.cvtColor(np.array(pil_base), cv2.COLOR_RGB2BGR)

    # Let's produce 3 distinct candidates:
    # Candidate 1B: Default Exact Arch (clean hair strand, crisp anime lineart, emerald eye H=45, gothic skin)
    c1b = process_image(c1, 'default_exact')
    cv2.imwrite('C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/cthulhu_summer_brow_cand1.png', c1b)

    # Candidate 2B: Sharp Occult Brow (sleek, tapered ink-line, heightened clarity)
    c2b = process_image(c2, 'sharp_anime')
    cv2.imwrite('C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/cthulhu_summer_brow_cand2.png', c2b)

    # Candidate 3B: Clean Subtle Contoured (classic anime line extending cleanly without muddiness)
    c3b = process_image(c1, 'subtle_translucent')
    cv2.imwrite('C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/cthulhu_summer_brow_cand3.png', c3b)

    print('Eyebrow candidates generated successfully.')

if __name__ == '__main__':
    refine_eyebrows()

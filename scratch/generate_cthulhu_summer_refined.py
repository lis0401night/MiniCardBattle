"""
Generate refined candidates for Cthulhu (Nyia) summer skin.
Requirements:
1. Facial structure & expression: 100% match Option 2 (sharp chin, sly smirk showing white teeth, no lipstick, cat-eyes).
2. Image quality: Pristine, crystal-clear 2D anime masterwork, zero blur/noise, preserving original ultra-sharp background/costume.
3. Eye color: Enchanting emerald green matching default skin (char_cthulhu.webp).
4. Skin color: Natural porcelain gothic fair skin matching default skin (char_cthulhu.webp), zero sunburn/dirty shadows.
"""

import cv2
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

def create_candidates():
    orig = cv2.imread('e:/project_arakia/projects/MiniCardBattle/public/assets/characters/char_cthulhu_summer.webp')
    v2 = cv2.imread('C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/cthulhu_summer_clean_v2_1789902570304.jpg')
    default_skin = cv2.imread('e:/project_arakia/projects/MiniCardBattle/public/assets/characters/char_cthulhu.webp')

    # v2 resize to 800x1200
    v2_resized = cv2.resize(v2, (800, 1200), interpolation=cv2.INTER_LANCZOS4)

    # 1. Precise Eye Color Transformation:
    # Transform v2's neon-yellow-green (H ~ 50..60) to default skin's deep emerald green (H ~ 43..47) with rich depth and sparkling highlights
    def adjust_eyes(img, target_h=45, sat_mult=1.05, val_mult=1.12, contrast_boost=1.1):
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
        
        # Eyes bounding box in 800x1200
        # Character's right eye: y in 305..345, x in 370..425
        # Character's left eye: y in 295..335, x in 435..485
        eye_mask = np.zeros(img.shape[:2], dtype=bool)
        eye_mask[305:345, 370:425] = True
        eye_mask[295:335, 435:485] = True
        
        # Iris pixels have green hue: H between 35 and 75, S > 50, V > 40
        iris_mask = eye_mask & (hsv[:,:,0] >= 35) & (hsv[:,:,0] <= 75) & (hsv[:,:,1] > 50) & (hsv[:,:,2] > 40)
        
        # Shift hue towards target_h (default skin emerald: ~44..46)
        hsv[iris_mask, 0] = target_h + (hsv[iris_mask, 0] - 55.0) * 0.3
        hsv[iris_mask, 0] = np.clip(hsv[iris_mask, 0], 38, 48) # emerald green range
        
        # Enhance saturation and value for gem-like sparkle
        hsv[iris_mask, 1] = np.clip(hsv[iris_mask, 1] * sat_mult, 0, 255)
        hsv[iris_mask, 2] = np.clip(hsv[iris_mask, 2] * val_mult, 0, 255)
        
        res = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
        return res

    # 2. Precise Skin Tone Calibration:
    # Adjust v2's slightly pale/blue skin to match default skin's natural gothic porcelain tone
    # (warm, fair, flawless gothic skin, without any muddiness or sunburn)
    def calibrate_skin_tone(img, warmth=1.04, red_boost=1.03, blue_reduce=0.97):
        # Face and body skin area
        # Face: y in 280..440, x in 350..500
        # Neck & Chest: y in 430..600, x in 340..600
        res = img.copy().astype(np.float32)
        
        # Create soft mask for skin (excluding hair, eyes, lips, hat)
        # Skin in v2 is high lightness, low saturation
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        h, s, v = hsv[:,:,0], hsv[:,:,1], hsv[:,:,2]
        
        # Skin mask
        skin_candidate = (v > 100) & (s < 70) & (h < 25) # typical skin range
        
        # Exclude hair (purple hair has h ~ 120..160, s > 40)
        not_hair = ~((h >= 110) & (h <= 170) & (s > 30))
        
        # Exclude eye irises
        not_eye = ~((h >= 35) & (h <= 85) & (s > 40))
        
        # Exclude dark lineart
        not_lineart = (v > 60)
        
        skin_mask = skin_candidate & not_hair & not_eye & not_lineart
        
        # Focus on head / face / upper body
        y_coords, x_coords = np.ogrid[:1200, :800]
        region_mask = (y_coords >= 280) & (y_coords <= 650) & (x_coords >= 320) & (x_coords <= 600)
        final_skin_mask = (skin_mask & region_mask).astype(np.float32)
        final_skin_mask = cv2.GaussianBlur(final_skin_mask, (15, 15), 0)
        
        # Apply gentle color calibration: boost Red slightly, reduce Blue slightly
        b, g, r = cv2.split(res)
        r = r * (1.0 + (red_boost - 1.0) * final_skin_mask)
        b = b * (1.0 + (blue_reduce - 1.0) * final_skin_mask)
        g = g * (1.0 + (warmth - 1.0) * final_skin_mask * 0.5)
        
        res = cv2.merge([b, g, r])
        return np.clip(res, 0, 255).astype(np.uint8)

    # 3. High-Fidelity Sharpness & Line Art Restoration:
    def enhance_lineart_and_clarity(img):
        # Convert to PIL for subtle unsharp mask
        pil_img = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
        
        # Unsharp mask specifically tuned for anime lineart
        # radius=1.2, percent=130, threshold=2
        sharpened = pil_img.filter(ImageFilter.UnsharpMask(radius=1.2, percent=125, threshold=2))
        
        # Contrast slight enhance
        enhancer = ImageEnhance.Contrast(sharpened)
        enhanced = enhancer.enhance(1.03)
        
        return cv2.cvtColor(np.array(enhanced), cv2.COLOR_RGB2BGR)

    # 4. Seamless Composite: Keep 100% of original master background, costume, hat, tentacles, etc.
    def composite_with_original_master(refined_face_img, feather_radius=21):
        # We only want to replace the face and immediate skin (where v2 improved the expression, jaw, and cleared the sunburn dirt)
        # Face bounding: y in 275..435, x in 350..495
        mask = np.zeros((1200, 800), dtype=np.float32)
        
        # Polygon around the face, staying strictly INSIDE the straw hat brim, inside the hair bangs, and around the jaw
        pts = np.array([
            [365, 290], # top-left hair
            [480, 280], # top-right hair
            [485, 340], # right hair/cheek
            [475, 410], # right jaw
            [430, 440], # chin
            [370, 400], # left jaw
            [355, 330], # left cheek
        ], np.int32)
        
        cv2.fillPoly(mask, [pts], 1.0)
        
        # Smooth gaussian blur for perfect, imperceptible seam
        mask = cv2.GaussianBlur(mask, (feather_radius, feather_radius), 0)
        mask_3d = np.repeat(mask[:, :, np.newaxis], 3, axis=2)
        
        # Blend: original master everywhere else, refined face inside the mask
        result = (orig.astype(np.float32) * (1.0 - mask_3d) + refined_face_img.astype(np.float32) * mask_3d)
        return np.clip(result, 0, 255).astype(np.uint8)

    # Candidate 1: Standard Default Match (H=45 emerald, natural gothic porcelain skin, crisp lineart)
    c1_face = adjust_eyes(v2_resized, target_h=45, sat_mult=1.05, val_mult=1.12)
    c1_face = calibrate_skin_tone(c1_face, warmth=1.03, red_boost=1.03, blue_reduce=0.97)
    c1_face = enhance_lineart_and_clarity(c1_face)
    c1_final = composite_with_original_master(c1_face)

    # Candidate 2: Vivid Emerald Sparkle (H=44 emerald, slightly higher iris sparkle and clarity)
    c2_face = adjust_eyes(v2_resized, target_h=44, sat_mult=1.15, val_mult=1.20)
    c2_face = calibrate_skin_tone(c2_face, warmth=1.02, red_boost=1.02, blue_reduce=0.98)
    c2_face = enhance_lineart_and_clarity(c2_face)
    c2_final = composite_with_original_master(c2_face)

    # Candidate 3: Deep Occult Emerald & Crisp Eye Contours (H=46 deep emerald, enhanced eyelash/eyeline contrast)
    c3_face = adjust_eyes(v2_resized, target_h=46, sat_mult=1.08, val_mult=1.08)
    c3_face = calibrate_skin_tone(c3_face, warmth=1.04, red_boost=1.04, blue_reduce=0.96)
    
    # Extra sharp eyeline contrast for Candidate 3
    pil_c3 = Image.fromarray(cv2.cvtColor(c3_face, cv2.COLOR_BGR2RGB))
    pil_c3 = pil_c3.filter(ImageFilter.UnsharpMask(radius=1.5, percent=140, threshold=1))
    c3_face = cv2.cvtColor(np.array(pil_c3), cv2.COLOR_RGB2BGR)
    c3_final = composite_with_original_master(c3_face)

    # Save candidates
    cv2.imwrite('C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/cthulhu_summer_candidate_1.png', c1_final)
    cv2.imwrite('C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/cthulhu_summer_candidate_2.png', c2_final)
    cv2.imwrite('C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/cthulhu_summer_candidate_3.png', c3_final)
    print('All candidates created successfully!')

if __name__ == '__main__':
    create_candidates()

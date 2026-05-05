package com.overlang.domain.ocr.repository;

import com.overlang.domain.ocr.entity.OcrItem;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OcrItemRepository extends JpaRepository<OcrItem, Long> {}

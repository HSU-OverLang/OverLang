package com.overlang.domain.savedword.repository;

import com.overlang.domain.savedword.entity.SavedWord;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SavedWordRepository extends JpaRepository<SavedWord, Long> {}

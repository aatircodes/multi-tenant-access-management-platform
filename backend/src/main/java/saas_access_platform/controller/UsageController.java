package saas_access_platform.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import saas_access_platform.dto.response.UsageResponse;
import saas_access_platform.service.UsageService;

@RestController
@RequestMapping("/api/usage")
@RequiredArgsConstructor
public class UsageController {

    private final UsageService usageService;

    @GetMapping
    public UsageResponse getUsage() {
        return usageService.getUsage();
    }
}